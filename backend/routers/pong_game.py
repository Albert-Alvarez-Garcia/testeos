"""
pong_game.py  ·  Backend del minijuego "Pong Isométrico"
=========================================================

Router FastAPI con:
  · Lobby por sala (host, duplicados, chat, configuración)           -> /api/pong/ws/lobby/{room_id}
  · Partida con física AUTORITATIVA en el servidor (60 Hz)           -> /api/pong/ws/game/{room_id}
  · Modo ONLINE (1vs1, dos conexiones) y modo LOCAL (una conexión que
    controla las dos palas, 2 jugadores en el mismo PC)
  · Condición de victoria configurable:
        "goals" -> Límite de goles (el primero en llegar a N)
        "time"  -> Contrarreloj (gana quien lidere al acabar el tiempo;
                   si hay empate, muerte súbita: el siguiente gol gana)
  · Reconexión robusta: se conservan marcador, palas y pelota; la partida se
    pausa mientras falta alguien y, si no vuelve a tiempo, pierde por abandono.

IMPORTANTE (isométrico): el servidor simula en un plano 2D "plano" de
WORLD_W x WORLD_H unidades. La proyección isométrica es SOLO visual y la
hace el frontend (x,y del mundo -> pantalla). Así la física no depende de
la cámara.

Convención de ejes del mundo:
  · x: 0 = portería del jugador 0 (izquierda)  ·  WORLD_W = portería del jugador 1 (derecha)
  · y: 0 = borde "superior" del tapete         ·  WORLD_H = borde "inferior"
  · INPUT direction = -1 mueve la pala hacia y=0, +1 hacia y=WORLD_H, 0 = quieta.

Protocolo (JSON). Cliente -> servidor en /ws/game:
  {"action":"INPUT","direction":-1|0|1}                 (online: tu pala)
  {"action":"INPUT","player":1|2,"direction":-1|0|1}    (local: elige pala)
  {"action":"SET_STYLE", ...}      ball_mana, table_theme (solo host);
                                   paddle_color, paddle_style (tu pala; en local + "player")
  {"action":"TOGGLE_PAUSE"}        (solo modo local)
  {"action":"REMATCH"}             (solo host, con la partida terminada)
  {"action":"LEAVE"}               (abandono voluntario: derrota inmediata en online)
  {"action":"PING","t":<lo que quieras>}

Servidor -> cliente en /ws/game:
  ROOM_INFO, STATE (30 Hz), GOAL, OVERTIME, EVENT (paddle_hit / wall_hit),
  GAME_OVER, PONG, ERROR
"""
import asyncio
import json
import math
import random
import re
import time
import traceback
import uuid
from typing import Dict, List, Optional, Union

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.security import ws_username

router = APIRouter(
    prefix="/api/pong",
    tags=["Pong Isométrico y Lobby"]
)

# ---------------------------------------------------------------------------
# CONSTANTES DE JUEGO
# ---------------------------------------------------------------------------
# Mundo (unidades planas 2D; el frontend las proyecta en isométrico)
WORLD_W = 800.0
WORLD_H = 480.0
PADDLE_W = 14.0            # grosor de la pala (eje x)
PADDLE_H = 90.0            # largo de la pala (eje y)
PADDLE_MARGIN = 24.0       # distancia entre la pala y su línea de gol
PADDLE_SPEED = 520.0       # unidades / segundo
BALL_RADIUS = 10.0
BALL_SPEED_INIT = 380.0
BALL_SPEED_MAX = 900.0     # con 60 Hz = 15 u/tick < grosor pala + radio: no hay "tunneling"
BALL_SPEEDUP = 1.06        # multiplicador de velocidad en cada golpe de pala
MAX_BOUNCE_ANGLE = math.radians(60)   # ángulo máximo de rebote en los extremos de la pala
MAX_SERVE_ANGLE = math.radians(25)    # dispersión del saque

# Simulación y red
PHYSICS_HZ = 60
STEP = 1.0 / PHYSICS_HZ
BROADCAST_EVERY = 2        # un STATE cada 2 ticks físicos -> 30 Hz
SEND_TIMEOUT = 2.0         # un cliente lento no puede bloquear el bucle del juego
MAX_LOOP_RETRIES = 5

# Tiempos (segundos)
START_COUNTDOWN = 3.0      # cuenta atrás inicial
SERVE_COUNTDOWN = 2.0      # cuenta atrás tras cada gol
RESUME_COUNTDOWN = 2.0     # cuenta atrás al reanudar tras una pausa
GOAL_PAUSE = 1.5           # pausa mostrando el gol
JOIN_GRACE = 45.0          # tiempo máximo esperando a que lleguen los jugadores al empezar
RECONNECT_GRACE = 30.0     # tiempo máximo que se espera a un jugador desconectado
EMPTY_ROOM_GRACE = 30.0    # una sala de juego sin nadie conectado se conserva este tiempo
PENDING_TTL = 120.0        # validez de la configuración que el lobby deja para la partida

# Límites de configuración
GOAL_LIMIT_MIN, GOAL_LIMIT_MAX = 1, 21
TIME_LIMIT_MIN, TIME_LIMIT_MAX = 30, 900
CHAT_MAX_LEN = 200
USERNAME_MAX_LEN = 20

# Opciones de personalización (lista blanca: el servidor nunca acepta otros valores)
MODES = ("online", "local")
WIN_MODES = ("goals", "time")
MANA_COLORS = ("white", "blue", "black", "red", "green")   # orbes de maná de Magic: The Gathering
TABLE_THEMES = ("felt_green", "felt_blue", "felt_red", "felt_black", "wood", "slate")
PADDLE_STYLES = ("classic", "neon", "wood", "stone", "gold")
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_PADDLE_COLORS = ["#f5c542", "#4cc9f0"]

DEFAULT_CONFIG = {
    "mode": "online",
    "win_mode": "goals",
    "goal_limit": 5,
    "time_limit": 120,
    "ball_mana": "red",
    "table_theme": "felt_green",
}

WORLD_INFO = {
    "width": WORLD_W,
    "height": WORLD_H,
    "paddle_width": PADDLE_W,
    "paddle_height": PADDLE_H,
    "paddle_margin": PADDLE_MARGIN,
    "paddle_speed": PADDLE_SPEED,
    "ball_radius": BALL_RADIUS,
}


# ---------------------------------------------------------------------------
# UTILIDADES
# ---------------------------------------------------------------------------
def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def to_int(value, default: int, lo: int, hi: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, number))


def clean_username(raw, default: str) -> str:
    name = re.sub(r"\s+", " ", str(raw or "")).strip()[:USERNAME_MAX_LEN]
    return name or default


def capacity(mode: str) -> int:
    """Jugadores humanos (conexiones) que admite una sala según su modo."""
    return 1 if mode == "local" else 2


def sanitize_config(raw: dict, base: dict) -> dict:
    """Devuelve una copia de `base` con los campos válidos de `raw` aplicados."""
    cfg = dict(base)
    if raw.get("mode") in MODES:
        cfg["mode"] = raw["mode"]
    if raw.get("win_mode") in WIN_MODES:
        cfg["win_mode"] = raw["win_mode"]
    if "goal_limit" in raw:
        cfg["goal_limit"] = to_int(raw["goal_limit"], cfg["goal_limit"], GOAL_LIMIT_MIN, GOAL_LIMIT_MAX)
    if "time_limit" in raw:
        cfg["time_limit"] = to_int(raw["time_limit"], cfg["time_limit"], TIME_LIMIT_MIN, TIME_LIMIT_MAX)
    if raw.get("ball_mana") in MANA_COLORS:
        cfg["ball_mana"] = raw["ball_mana"]
    if raw.get("table_theme") in TABLE_THEMES:
        cfg["table_theme"] = raw["table_theme"]
    return cfg


async def safe_send(ws: Optional[WebSocket], message: dict):
    """Envío tolerante a fallos y con timeout (un socket muerto no tumba el bucle)."""
    if ws is None:
        return
    try:
        await asyncio.wait_for(ws.send_json(message), timeout=SEND_TIMEOUT)
    except Exception:
        # El socket está roto o va demasiado lento; el handler de recepción
        # detectará la desconexión y hará la limpieza correspondiente.
        pass


async def receive_json_safe(ws: WebSocket) -> Optional[dict]:
    """Lee un mensaje; si no es un JSON-objeto válido devuelve None en vez de romper la conexión."""
    raw = await ws.receive_text()
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


# ---------------------------------------------------------------------------
# ESTADO DE UNA PARTIDA (una por sala). El SERVIDOR es el dueño de la física,
# del marcador y del reloj; los clientes solo envían inputs y pintan.
# ---------------------------------------------------------------------------
class PongRoom:
    def __init__(self, room_id: str, config: dict, host: str,
                 expected: List[str], token: Optional[str] = None):
        self.room_id = room_id
        self.config = dict(config)
        self.token = token                     # identifica la partida lanzada desde el lobby
        self.host = host
        self.mode: str = self.config["mode"]
        self.win_mode: str = self.config["win_mode"]

        # slots[i] = username que ocupa el lado i (0 = izquierda, 1 = derecha).
        # Local: un único slot (el controlador, que maneja las dos palas).
        self.slots: List[Optional[str]] = [None] * capacity(self.mode)
        for i, name in enumerate(expected[:len(self.slots)]):
            self.slots[i] = name
        self.strict_slots = bool(expected)     # si viene del lobby, solo entran los de la lista

        # username -> {"ws": WebSocket | None}  (ws=None si está desconectado)
        self.players: Dict[str, dict] = {}

        # Personalización
        self.ball_mana: str = self.config["ball_mana"]
        self.table_theme: str = self.config["table_theme"]
        self.paddle_styles = [
            {"color": DEFAULT_PADDLE_COLORS[0], "style": "classic"},
            {"color": DEFAULT_PADDLE_COLORS[1], "style": "classic"},
        ]

        # Física
        self.paddle_y = [WORLD_H / 2, WORLD_H / 2]
        self.inputs = [0, 0]
        self.ball = {"x": WORLD_W / 2, "y": WORLD_H / 2, "vx": 0.0, "vy": 0.0}
        self.serve_dir = random.choice([-1, 1])
        self.serve_pending = True

        # Marcador y reloj
        self.scores = [0, 0]
        self.time_remaining: Optional[float] = (
            float(self.config["time_limit"]) if self.win_mode == "time" else None
        )
        self.overtime = False
        self.elapsed = 0.0                     # tiempo de juego efectivo
        self.hits = 0
        self.max_speed = 0.0

        # Fases: waiting | countdown | playing | goal | paused | finished
        self.phase = "waiting"
        self.phase_timer = 0.0
        self.pause_reason: Optional[str] = None        # "disconnect" | "manual"
        self.pause_state: Optional[dict] = None
        self.deadline: Optional[float] = time.monotonic() + JOIN_GRACE

        # Resultado
        self.finished = False
        self.winner_side: Optional[int] = None
        self.finish_reason: Optional[str] = None
        self.over_payload: Optional[dict] = None

        self.seq = 0
        self.loop_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None

    # ------------------------- Jugadores / conexiones -------------------------
    def is_connected(self, name: Optional[str]) -> bool:
        if name is None:
            return False
        player = self.players.get(name)
        return bool(player and player["ws"] is not None)

    def connected_names(self) -> List[str]:
        return [u for u, p in self.players.items() if p["ws"] is not None]

    def connected_count(self) -> int:
        return len(self.connected_names())

    def missing_slots(self) -> List[int]:
        """Slots sin jugador asignado o cuyo jugador está desconectado."""
        return [i for i, name in enumerate(self.slots) if name is None or not self.is_connected(name)]

    def effective_host(self) -> str:
        """El host original mientras esté conectado; si no, el primero conectado."""
        if self.is_connected(self.host):
            return self.host
        connected = self.connected_names()
        return connected[0] if connected else self.host

    def is_host(self, username: str) -> bool:
        return username == self.effective_host()

    def side_of(self, username: str) -> Union[int, str, None]:
        if self.mode == "local":
            return "both" if self.slots and self.slots[0] == username else None
        return self.slots.index(username) if username in self.slots else None

    def is_side_connected(self, side: int) -> bool:
        if self.mode == "local":
            return self.is_connected(self.slots[0])
        return self.is_connected(self.slots[side])

    def names(self) -> List[str]:
        if self.mode == "local":
            return ["Jugador 1", "Jugador 2"]
        return [self.slots[i] or f"Jugador {i + 1}" for i in (0, 1)]

    def admit(self, username: str) -> Optional[str]:
        """None si puede entrar (y reserva slot si procede); si no, un código de error."""
        if username in self.slots or username in self.players:
            return None                                   # reconexión / jugador esperado
        if self.strict_slots:
            return "NOT_IN_GAME"
        free = [i for i, name in enumerate(self.slots) if name is None]
        if not free:
            return "ROOM_FULL"
        self.slots[free[0]] = username
        return None

    # ------------------------- Mensajes -------------------------
    def info_payload(self, username: Optional[str] = None) -> dict:
        names = self.names()
        return {
            "type": "ROOM_INFO",
            "room_id": self.room_id,
            "world": WORLD_INFO,
            "mode": self.mode,
            "win_mode": self.win_mode,
            "goal_limit": self.config["goal_limit"],
            "time_limit": self.config["time_limit"],
            "style": {"ball_mana": self.ball_mana, "table_theme": self.table_theme},
            "players": [
                {
                    "side": i,
                    "username": names[i] if (self.mode == "local" or self.slots[i]) else None,
                    "connected": self.is_side_connected(i),
                    "paddle_color": self.paddle_styles[i]["color"],
                    "paddle_style": self.paddle_styles[i]["style"],
                }
                for i in (0, 1)
            ],
            "host": self.effective_host(),
            "your_side": self.side_of(username) if username else None,
            "finished": self.finished,
        }

    def state_payload(self) -> dict:
        self.seq += 1
        b = self.ball
        absent = self.phase == "waiting" or (self.phase == "paused" and self.pause_reason == "disconnect")
        remaining = None
        if absent and self.deadline is not None:
            remaining = round(max(0.0, self.deadline - time.monotonic()), 1)
        return {
            "type": "STATE",
            "seq": self.seq,
            "ts": round(time.time(), 3),
            "phase": self.phase,
            "countdown": round(max(0.0, self.phase_timer), 2) if self.phase == "countdown" else 0.0,
            "pause_reason": self.pause_reason if self.phase == "paused" else None,
            "waiting_for": [self.slots[i] for i in self.missing_slots()] if absent else [],
            "reconnect_remaining": remaining,
            "ball": {
                "x": round(b["x"], 1),
                "y": round(b["y"], 1),
                "vx": round(b["vx"], 1),
                "vy": round(b["vy"], 1),
            },
            "paddles": [round(self.paddle_y[0], 1), round(self.paddle_y[1], 1)],
            "scores": list(self.scores),
            "time_remaining": None if self.time_remaining is None else round(self.time_remaining, 1),
            "overtime": self.overtime,
        }

    async def broadcast(self, message: dict):
        sockets = [p["ws"] for p in list(self.players.values()) if p["ws"] is not None]
        if sockets:
            await asyncio.gather(*(safe_send(ws, message) for ws in sockets))

    async def broadcast_state(self):
        if self.connected_count():
            await self.broadcast(self.state_payload())

    async def broadcast_info(self):
        targets = [(u, p["ws"]) for u, p in list(self.players.items()) if p["ws"] is not None]
        if targets:
            await asyncio.gather(*(safe_send(ws, self.info_payload(u)) for u, ws in targets))

    # ------------------------- Entradas del jugador -------------------------
    def handle_input(self, username: str, data: dict):
        direction = to_int(data.get("direction"), 0, -1, 1)
        if self.mode == "local":
            if not self.slots or username != self.slots[0]:
                return
            player = data.get("player")
            if player not in (1, 2):
                return
            self.inputs[player - 1] = direction
        else:
            side = self.side_of(username)
            if side in (0, 1):
                self.inputs[side] = direction

    def release_inputs(self, username: str):
        """Suelta las teclas de un jugador (p. ej. al desconectarse) para que su pala no se quede corriendo."""
        if self.mode == "local":
            if self.slots and self.slots[0] == username:
                self.inputs = [0, 0]
        else:
            side = self.side_of(username)
            if side in (0, 1):
                self.inputs[side] = 0

    def handle_style(self, username: str, data: dict) -> bool:
        """Aplica personalización. Devuelve True si algo cambió."""
        changed = False

        # Bola y tapete: solo el host (afectan a todos los espectadores de la mesa)
        if self.is_host(username):
            if data.get("ball_mana") in MANA_COLORS and data["ball_mana"] != self.ball_mana:
                self.ball_mana = data["ball_mana"]
                changed = True
            if data.get("table_theme") in TABLE_THEMES and data["table_theme"] != self.table_theme:
                self.table_theme = data["table_theme"]
                changed = True

        # Pala: cada jugador la suya; en local el controlador elige con "player"
        target: Optional[int] = None
        if self.mode == "local":
            if self.slots and username == self.slots[0] and data.get("player") in (1, 2):
                target = data["player"] - 1
        else:
            side = self.side_of(username)
            target = side if side in (0, 1) else None

        if target is not None:
            color = data.get("paddle_color")
            if isinstance(color, str) and HEX_COLOR_RE.match(color):
                color = color.lower()
                if color != self.paddle_styles[target]["color"]:
                    self.paddle_styles[target]["color"] = color
                    changed = True
            style = data.get("paddle_style")
            if style in PADDLE_STYLES and style != self.paddle_styles[target]["style"]:
                self.paddle_styles[target]["style"] = style
                changed = True
        return changed

    def toggle_pause(self, username: str):
        """Pausa manual: solo en modo local y solo el controlador."""
        if self.mode != "local" or not self.slots or username != self.slots[0]:
            return
        if self.phase in ("countdown", "goal", "playing"):
            self.pause("manual")
        elif self.phase == "paused" and self.pause_reason == "manual":
            self.resume_from_pause()

    # ------------------------- Control de fases -------------------------
    def start_countdown(self, seconds: float, serve: bool):
        self.phase = "countdown"
        self.phase_timer = seconds
        self.serve_pending = serve

    def pause(self, reason: str):
        self.pause_state = {
            "phase": self.phase,
            "timer": self.phase_timer,
            "serve_pending": self.serve_pending,
        }
        self.phase = "paused"
        self.pause_reason = reason
        self.deadline = time.monotonic() + RECONNECT_GRACE if reason == "disconnect" else None

    def resume_from_pause(self):
        state = self.pause_state or {"phase": "playing", "timer": 0.0, "serve_pending": False}
        self.pause_reason = None
        self.deadline = None
        previous = state["phase"]
        if previous == "goal":
            self.phase = "goal"
            self.phase_timer = state["timer"]
        elif previous == "countdown":
            self.start_countdown(RESUME_COUNTDOWN, serve=state["serve_pending"])
        else:
            # Se estaba jugando: cuenta atrás y la bola sigue con su velocidad
            self.start_countdown(RESUME_COUNTDOWN, serve=False)
        self.pause_state = None

    def reset_positions(self):
        self.paddle_y = [WORLD_H / 2, WORLD_H / 2]
        self.ball = {"x": WORLD_W / 2, "y": WORLD_H / 2, "vx": 0.0, "vy": 0.0}

    def serve_ball(self):
        angle = random.uniform(-MAX_SERVE_ANGLE, MAX_SERVE_ANGLE)
        self.ball = {
            "x": WORLD_W / 2,
            "y": WORLD_H / 2,
            "vx": self.serve_dir * math.cos(angle) * BALL_SPEED_INIT,
            "vy": math.sin(angle) * BALL_SPEED_INIT,
        }

    def reset_for_rematch(self):
        self.scores = [0, 0]
        self.overtime = False
        self.elapsed = 0.0
        self.hits = 0
        self.max_speed = 0.0
        self.time_remaining = float(self.config["time_limit"]) if self.win_mode == "time" else None
        self.finished = False
        self.winner_side = None
        self.finish_reason = None
        self.over_payload = None
        self.pause_reason = None
        self.pause_state = None
        self.inputs = [0, 0]
        self.serve_dir = random.choice([-1, 1])
        self.reset_positions()
        self.phase = "waiting"
        self.deadline = time.monotonic() + RECONNECT_GRACE

    def finish(self, winner_side: Optional[int], reason: str) -> List[dict]:
        if self.finished:
            return []
        self.finished = True
        self.phase = "finished"
        self.winner_side = winner_side
        self.finish_reason = reason
        self.pause_reason = None
        self.deadline = None
        self.inputs = [0, 0]
        names = self.names()
        ranking = sorted(
            [{"side": i, "username": names[i], "score": self.scores[i]} for i in (0, 1)],
            key=lambda r: -r["score"],
        )
        self.over_payload = {
            "type": "GAME_OVER",
            "winner": names[winner_side] if winner_side is not None else None,
            "winner_side": winner_side,
            "reason": reason,        # goal_limit | time | sudden_death | forfeit | no_show | abandoned
            "scores": list(self.scores),
            "ranking": ranking,
            "duration": round(self.elapsed, 1),
            "stats": {"hits": self.hits, "max_speed": round(self.max_speed, 1)},
        }
        return [self.over_payload]

    def forfeit(self, reason: str) -> List[dict]:
        """Se agotó la espera: gana el único jugador que sigue conectado (solo online)."""
        connected = [i for i in (0, 1) if self.mode == "online" and self.is_side_connected(i)]
        if len(connected) == 1:
            return self.finish(connected[0], "no_show" if reason == "no_show" else "forfeit")
        return self.finish(None, "abandoned")

    # ------------------------- Un tick de simulación -------------------------
    def step(self, dt: float) -> List[dict]:
        """Avanza la partida `dt` segundos. Devuelve los mensajes (eventos) a difundir."""
        if self.phase == "finished":
            return []

        events: List[dict] = []
        now = time.monotonic()
        missing = self.missing_slots()

        # --- Esperando a que lleguen los jugadores ---
        if self.phase == "waiting":
            if not missing:
                self.deadline = None
                self.start_countdown(START_COUNTDOWN, serve=True)
            elif self.deadline is not None and now > self.deadline:
                return self.forfeit("no_show")
            return events

        # --- En pausa ---
        if self.phase == "paused":
            if self.pause_reason == "manual" and missing:
                # El controlador se fue durante la pausa manual: pasa a ausencia con plazo
                self.pause_reason = "disconnect"
                self.deadline = now + RECONNECT_GRACE
            if self.pause_reason == "disconnect":
                if not missing:
                    self.resume_from_pause()
                elif self.deadline is not None and now > self.deadline:
                    return self.forfeit("disconnect")
            return events

        # --- Alguien se ha caído durante la partida: pausar ---
        if missing:
            self.pause("disconnect")
            return events

        # --- Palas: se mueven en cuenta atrás, pausa de gol y juego ---
        for i in (0, 1):
            if self.inputs[i]:
                self.paddle_y[i] = clamp(
                    self.paddle_y[i] + self.inputs[i] * PADDLE_SPEED * dt,
                    PADDLE_H / 2,
                    WORLD_H - PADDLE_H / 2,
                )

        if self.phase == "countdown":
            self.phase_timer -= dt
            if self.phase_timer <= 0:
                if self.serve_pending:
                    self.serve_ball()
                self.phase_timer = 0.0
                self.phase = "playing"
            return events

        if self.phase == "goal":
            self.phase_timer -= dt
            if self.phase_timer <= 0:
                self.reset_positions()
                self.start_countdown(SERVE_COUNTDOWN, serve=True)
            return events

        return self._step_playing(dt)

    def _step_playing(self, dt: float) -> List[dict]:
        events: List[dict] = []
        self.elapsed += dt
        if self.time_remaining is not None and not self.overtime:
            self.time_remaining = max(0.0, self.time_remaining - dt)

        b = self.ball
        b["x"] += b["vx"] * dt
        b["y"] += b["vy"] * dt

        # Paredes superior e inferior
        if b["y"] - BALL_RADIUS < 0.0:
            b["y"] = BALL_RADIUS
            b["vy"] = abs(b["vy"])
            events.append({"type": "EVENT", "event": "wall_hit", "x": round(b["x"], 1), "y": round(b["y"], 1)})
        elif b["y"] + BALL_RADIUS > WORLD_H:
            b["y"] = WORLD_H - BALL_RADIUS
            b["vy"] = -abs(b["vy"])
            events.append({"type": "EVENT", "event": "wall_hit", "x": round(b["x"], 1), "y": round(b["y"], 1)})

        # Palas
        for side in (0, 1):
            hit = self._collide_paddle(side)
            if hit:
                events.append(hit)

        # Goles (la bola ha salido entera por un lado)
        if b["x"] + BALL_RADIUS < 0.0:
            return events + self._score_goal(1)
        if b["x"] - BALL_RADIUS > WORLD_W:
            return events + self._score_goal(0)

        # Fin del tiempo (modo contrarreloj)
        if self.time_remaining is not None and not self.overtime and self.time_remaining <= 0.0:
            if self.scores[0] != self.scores[1]:
                events += self.finish(0 if self.scores[0] > self.scores[1] else 1, "time")
            else:
                self.overtime = True        # muerte súbita: el siguiente gol gana
                events.append({"type": "OVERTIME"})
        return events

    def _paddle_rect(self, side: int):
        left = PADDLE_MARGIN if side == 0 else WORLD_W - PADDLE_MARGIN - PADDLE_W
        top = self.paddle_y[side] - PADDLE_H / 2
        return left, top, left + PADDLE_W, top + PADDLE_H

    def _collide_paddle(self, side: int) -> Optional[dict]:
        b = self.ball
        # Solo si la bola se acerca a esa pala
        if side == 0 and b["vx"] >= 0:
            return None
        if side == 1 and b["vx"] <= 0:
            return None

        left, top, right, bottom = self._paddle_rect(side)
        # Si el centro ya pasó por detrás de la pala, ya no se puede salvar
        if side == 0 and b["x"] < left:
            return None
        if side == 1 and b["x"] > right:
            return None

        closest_x = clamp(b["x"], left, right)
        closest_y = clamp(b["y"], top, bottom)
        dx = b["x"] - closest_x
        dy = b["y"] - closest_y
        if dx * dx + dy * dy > BALL_RADIUS * BALL_RADIUS:
            return None

        # Ángulo según el punto de impacto: centro = recto, extremos = más inclinado
        offset = clamp((b["y"] - self.paddle_y[side]) / (PADDLE_H / 2), -1.0, 1.0)
        angle = offset * MAX_BOUNCE_ANGLE
        speed = min(BALL_SPEED_MAX, math.hypot(b["vx"], b["vy"]) * BALL_SPEEDUP)
        direction = 1 if side == 0 else -1
        b["vx"] = direction * math.cos(angle) * speed
        b["vy"] = math.sin(angle) * speed
        b["x"] = (right + BALL_RADIUS) if side == 0 else (left - BALL_RADIUS)

        self.hits += 1
        self.max_speed = max(self.max_speed, speed)
        return {
            "type": "EVENT",
            "event": "paddle_hit",
            "side": side,
            "x": round(b["x"], 1),
            "y": round(b["y"], 1),
            "speed": round(speed, 1),
        }

    def _score_goal(self, scorer: int) -> List[dict]:
        self.scores[scorer] += 1
        events: List[dict] = [{
            "type": "GOAL",
            "scorer_side": scorer,
            "scorer": self.names()[scorer],
            "scores": list(self.scores),
            "overtime": self.overtime,
        }]
        self.ball["vx"] = 0.0
        self.ball["vy"] = 0.0
        # Saca el que ha encajado el gol: la bola va hacia él
        self.serve_dir = 1 if scorer == 0 else -1

        if self.win_mode == "goals" and self.scores[scorer] >= self.config["goal_limit"]:
            events += self.finish(scorer, "goal_limit")
        elif self.overtime:
            events += self.finish(scorer, "sudden_death")
        else:
            self.phase = "goal"
            self.phase_timer = GOAL_PAUSE
        return events


# ---------------------------------------------------------------------------
# GESTOR (lobbies + partidas)
# ---------------------------------------------------------------------------
class PongManager:
    def __init__(self):
        # --- Lobby ---
        self.lobbies: Dict[str, List[WebSocket]] = {}
        self.lobby_players: Dict[WebSocket, dict] = {}
        self.room_config: Dict[str, dict] = {}
        # Configuración que el lobby deja preparada al pulsar "Empezar"
        self.pending_games: Dict[str, dict] = {}
        # --- Partidas ---
        self.game_rooms: Dict[str, PongRoom] = {}

    # ======================= LOBBY =======================
    async def connect_lobby(self, websocket: WebSocket, room_id: str, username: str) -> bool:
        """Acepta al jugador en el lobby. Devuelve False si se le rechaza (sala llena)."""
        await websocket.accept()
        members = self.lobbies.setdefault(room_id, [])
        config = self.room_config.setdefault(room_id, dict(DEFAULT_CONFIG))

        # Control de duplicados: el mismo usuario reconectando sustituye al socket viejo
        existing_ws = next(
            (ws for ws in members if self.lobby_players.get(ws, {}).get("username") == username),
            None,
        )
        inherited_host = False
        if existing_ws is not None:
            inherited_host = self.lobby_players.get(existing_ws, {}).get("is_host", False)
            members.remove(existing_ws)
            self.lobby_players.pop(existing_ws, None)
            try:
                await existing_ws.close(code=4000)
            except Exception:
                pass
        elif len(members) >= capacity(config["mode"]):
            await safe_send(websocket, {
                "type": "ERROR",
                "code": "ROOM_FULL",
                "message": "La sala está llena.",
            })
            try:
                await websocket.close(code=1008)
            except Exception:
                pass
            return False

        members.append(websocket)
        self.lobby_players[websocket] = {
            "username": username,
            "is_host": inherited_host or len(members) == 1,
        }
        await self.broadcast_lobby_state(room_id)
        return True

    def disconnect_lobby(self, websocket: WebSocket, room_id: str):
        members = self.lobbies.get(room_id)
        if members is not None:
            if websocket in members:
                members.remove(websocket)

            # Si se va el host, el siguiente de la lista pasa a serlo
            if self.lobby_players.get(websocket, {}).get("is_host") and members:
                next_host_ws = members[0]
                if next_host_ws in self.lobby_players:
                    self.lobby_players[next_host_ws]["is_host"] = True

            if not members:
                del self.lobbies[room_id]
                self.room_config.pop(room_id, None)

        self.lobby_players.pop(websocket, None)

    def _start_error(self, room_id: str) -> Optional[dict]:
        members = self.lobbies.get(room_id, [])
        cfg = self.room_config.get(room_id, DEFAULT_CONFIG)
        if cfg["mode"] == "online" and len(members) < 2:
            return {"code": "NOT_ENOUGH_PLAYERS", "message": "Se necesitan 2 jugadores para el modo online."}
        if not members:
            return {"code": "EMPTY_ROOM", "message": "No hay jugadores en la sala."}
        return None

    def lobby_state(self, room_id: str) -> dict:
        cfg = self.room_config.get(room_id, DEFAULT_CONFIG)
        members = self.lobbies.get(room_id, [])
        game = self.game_rooms.get(room_id)
        return {
            "type": "LOBBY_STATE",
            "players": [
                {
                    "username": self.lobby_players[ws]["username"],
                    "is_host": self.lobby_players[ws]["is_host"],
                }
                for ws in members if ws in self.lobby_players
            ],
            "max_players": capacity(cfg["mode"]),
            "config": cfg,
            "can_start": self._start_error(room_id) is None,
            "in_game": bool(game and not game.finished),
        }

    async def broadcast_lobby_state(self, room_id: str):
        members = list(self.lobbies.get(room_id, []))
        if members:
            message = self.lobby_state(room_id)
            # "you" = el nombre con el que el servidor identifica a ESTE socket (puede diferir del que
            # el cliente cree tener: cuenta autenticada, nombre saneado...). El cliente lo usa para saber
            # si es el anfitrión y, así, imponer el modo local/online.
            await asyncio.gather(*(
                safe_send(ws, {**message, "you": self.lobby_players.get(ws, {}).get("username")})
                for ws in members
            ))

    async def lobby_chat(self, websocket: WebSocket, room_id: str, text) -> None:
        info = self.lobby_players.get(websocket)
        message = str(text or "").strip()[:CHAT_MAX_LEN]
        if not info or not message:
            return
        payload = {"type": "CHAT_MESSAGE", "username": info["username"], "message": message}
        members = list(self.lobbies.get(room_id, []))
        await asyncio.gather(*(safe_send(ws, payload) for ws in members))

    async def lobby_update_config(self, websocket: WebSocket, room_id: str, data: dict) -> None:
        info = self.lobby_players.get(websocket)
        if not info or not info["is_host"]:
            await safe_send(websocket, {"type": "ERROR", "code": "NOT_HOST",
                                        "message": "Solo el host puede cambiar la configuración."})
            return
        old = self.room_config.get(room_id, dict(DEFAULT_CONFIG))
        raw = data.get("config") if isinstance(data.get("config"), dict) else data
        new = sanitize_config(raw, old)
        members = self.lobbies.get(room_id, [])
        if capacity(new["mode"]) < len(members):
            await safe_send(websocket, {
                "type": "ERROR",
                "code": "TOO_MANY_PLAYERS",
                "message": "Hay más jugadores en la sala de los que admite ese modo.",
            })
            return
        self.room_config[room_id] = new
        await self.broadcast_lobby_state(room_id)

    async def lobby_start_game(self, websocket: WebSocket, room_id: str) -> None:
        info = self.lobby_players.get(websocket)
        if not info or not info["is_host"]:
            await safe_send(websocket, {"type": "ERROR", "code": "NOT_HOST",
                                        "message": "Solo el host puede empezar la partida."})
            return
        error = self._start_error(room_id)
        if error:
            await safe_send(websocket, {"type": "ERROR", **error})
            return

        existing = self.game_rooms.get(room_id)
        if existing is not None:
            if not existing.finished and existing.connected_count() > 0:
                await safe_send(websocket, {"type": "ERROR", "code": "GAME_IN_PROGRESS",
                                            "message": "Ya hay una partida en curso en esta sala."})
                return
            self._drop_game_room(existing)

        config = dict(self.room_config.get(room_id, DEFAULT_CONFIG))
        members = list(self.lobbies.get(room_id, []))
        host = info["username"]
        others = [self.lobby_players[ws]["username"] for ws in members
                  if ws in self.lobby_players and self.lobby_players[ws]["username"] != host]
        players = [host] + others
        if config["mode"] == "local":
            players = [host]

        # El lobby se vaciará al navegar a la pantalla de juego: la config se guarda aparte
        self.pending_games[room_id] = {
            "token": uuid.uuid4().hex,
            "config": config,
            "host": host,
            "players": players,
            "created": time.monotonic(),
        }
        payload = {
            "type": "START_GAME",
            "room_id": room_id,
            "mode": config["mode"],
            "config": config,
            "host": host,
            "players": players,
        }
        await asyncio.gather(*(
            safe_send(ws, {**payload, "you": self.lobby_players.get(ws, {}).get("username")})
            for ws in members
        ))

    # ======================= PARTIDA =======================
    def _take_pending(self, room_id: str) -> Optional[dict]:
        pending = self.pending_games.get(room_id)
        if pending and time.monotonic() - pending["created"] > PENDING_TTL:
            self.pending_games.pop(room_id, None)
            return None
        return pending

    async def connect_game(self, websocket: WebSocket, room_id: str, username: str,
                           query: Optional[dict] = None) -> Optional[PongRoom]:
        await websocket.accept()

        pending = self._take_pending(room_id)
        room = self.game_rooms.get(room_id)

        # Si el lobby lanzó una partida nueva, sustituye a una sala antigua
        if room is not None and pending is not None and room.token != pending["token"]:
            self._drop_game_room(room)
            room = None

        if room is None:
            if pending is not None:
                self.pending_games.pop(room_id, None)
                room = PongRoom(room_id, pending["config"], pending["host"],
                                pending["players"], pending["token"])
            else:
                # Acceso directo sin lobby: config por defecto + overrides por query string
                config = sanitize_config(query or {}, DEFAULT_CONFIG)
                room = PongRoom(room_id, config, username, [], None)
            self.game_rooms[room_id] = room
            room.loop_task = asyncio.create_task(self._game_loop(room))

        error = room.admit(username)
        if error:
            await safe_send(websocket, {
                "type": "ERROR",
                "code": error,
                "message": "La sala está llena." if error == "ROOM_FULL" else "No participas en esta partida.",
            })
            try:
                await websocket.close(code=1008)
            except Exception:
                pass
            return None

        if room.cleanup_task:
            room.cleanup_task.cancel()
            room.cleanup_task = None

        player = room.players.get(username)
        if player:
            # Reconexión: se conserva todo, solo cambia el socket
            old_ws = player["ws"]
            player["ws"] = websocket
            if old_ws is not None and old_ws is not websocket:
                try:
                    await old_ws.close(code=4000)
                except Exception:
                    pass
        else:
            room.players[username] = {"ws": websocket}

        # Estado actual para el que entra y aviso al resto
        await room.broadcast_info()
        await safe_send(websocket, room.state_payload())
        if room.finished and room.over_payload:
            await safe_send(websocket, room.over_payload)
        return room

    async def disconnect_game(self, room: PongRoom, username: str, websocket: WebSocket):
        player = room.players.get(username)
        if not player or player["ws"] is not websocket:
            return                       # ya había sido sustituido por una reconexión
        player["ws"] = None
        room.release_inputs(username)

        # La pausa / abandono por ausencia lo gestiona el bucle (room.step)
        if room.connected_count() == 0:
            if room.cleanup_task is None:
                room.cleanup_task = asyncio.create_task(self._cleanup_later(room))
        else:
            await room.broadcast_info()

    async def _cleanup_later(self, room: PongRoom):
        try:
            await asyncio.sleep(EMPTY_ROOM_GRACE)
        except asyncio.CancelledError:
            return
        if not room.connected_count():
            self._drop_game_room(room)

    def _drop_game_room(self, room: PongRoom):
        if self.game_rooms.get(room.room_id) is room:
            del self.game_rooms[room.room_id]
        for task in (room.loop_task, room.cleanup_task):
            if task and not task.done() and task is not asyncio.current_task():
                task.cancel()

    async def _game_loop(self, room: PongRoom):
        """Un único bucle por sala: física a 60 Hz con paso fijo y difusión a 30 Hz."""
        retries = 0
        while True:
            try:
                await self._run_loop(room)
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                retries += 1
                print(f"❌ Error en el bucle de juego ({room.room_id}):")
                traceback.print_exc()
                if retries >= MAX_LOOP_RETRIES:
                    await room.broadcast({"type": "ERROR", "code": "SERVER_ERROR",
                                          "message": "Error interno en la partida."})
                    self._drop_game_room(room)
                    return
                await asyncio.sleep(1)

    async def _run_loop(self, room: PongRoom):
        last = time.monotonic()
        acc = 0.0
        ticks = 0
        while True:
            await asyncio.sleep(STEP)
            now = time.monotonic()
            acc = min(acc + (now - last), STEP * 5)    # tope para no "recuperar" mil pasos tras un lag
            last = now

            while acc >= STEP:
                acc -= STEP
                for event in room.step(STEP):
                    await room.broadcast(event)
                ticks += 1
                if room.phase == "finished":
                    break
                if ticks % BROADCAST_EVERY == 0:
                    await room.broadcast_state()

            if room.phase == "finished":
                await room.broadcast_state()
                return

    # ======================= MENSAJES DE JUEGO =======================
    async def handle_message(self, room: PongRoom, username: str, websocket: WebSocket, data: dict):
        player = room.players.get(username)
        if not player or player["ws"] is not websocket:
            return
        action = data.get("action")

        if action == "INPUT":
            room.handle_input(username, data)

        elif action == "SET_STYLE":
            if room.handle_style(username, data):
                await room.broadcast_info()

        elif action == "TOGGLE_PAUSE":
            room.toggle_pause(username)
            await room.broadcast_state()

        elif action == "REMATCH":
            await self.handle_rematch(room, username, websocket)

        elif action == "LEAVE":
            await self.handle_leave(room, username)

        elif action == "PING":
            await safe_send(websocket, {"type": "PONG", "t": data.get("t"), "ts": round(time.time(), 3)})

    async def handle_rematch(self, room: PongRoom, username: str, websocket: WebSocket):
        if not room.finished:
            return
        if not room.is_host(username):
            await safe_send(websocket, {"type": "ERROR", "code": "NOT_HOST",
                                        "message": "Solo el host puede pedir la revancha."})
            return
        room.reset_for_rematch()
        if room.loop_task and not room.loop_task.done():
            room.loop_task.cancel()
        room.loop_task = asyncio.create_task(self._game_loop(room))
        await room.broadcast_info()
        await room.broadcast_state()

    async def handle_leave(self, room: PongRoom, username: str):
        """Abandono voluntario en una partida online ya empezada: derrota inmediata."""
        side = room.side_of(username)
        if room.finished or room.mode != "online" or room.phase == "waiting" or side not in (0, 1):
            return
        other = 1 - side
        winner = other if room.slots[other] else None
        events = room.finish(winner, "forfeit" if winner is not None else "abandoned")
        for event in events:
            await room.broadcast(event)
        await room.broadcast_state()


manager = PongManager()


# ---------------------------------------------------------------------------
# ENDPOINTS REST
# ---------------------------------------------------------------------------
@router.get("/rooms")
def get_active_rooms():
    """Lista de salas de lobby activas."""
    rooms = []
    for room_id, members in manager.lobbies.items():
        cfg = manager.room_config.get(room_id, DEFAULT_CONFIG)
        game = manager.game_rooms.get(room_id)
        in_game = bool(game and not game.finished)
        max_players = capacity(cfg["mode"])
        rooms.append({
            "room_id": room_id,
            "current_players": len(members),
            "max_players": max_players,
            "mode": cfg["mode"],
            "win_mode": cfg["win_mode"],
            "goal_limit": cfg["goal_limit"],
            "time_limit": cfg["time_limit"],
            "in_game": in_game,
            "joinable": len(members) < max_players and not in_game,
        })
    return {"rooms": rooms}


@router.get("/options")
def get_options():
    """Opciones válidas de configuración y personalización (para construir los selectores del frontend)."""
    return {
        "modes": list(MODES),
        "win_modes": list(WIN_MODES),
        "goal_limit": {"min": GOAL_LIMIT_MIN, "max": GOAL_LIMIT_MAX, "default": DEFAULT_CONFIG["goal_limit"]},
        "time_limit": {"min": TIME_LIMIT_MIN, "max": TIME_LIMIT_MAX, "default": DEFAULT_CONFIG["time_limit"]},
        "mana_colors": list(MANA_COLORS),
        "table_themes": list(TABLE_THEMES),
        "paddle_styles": list(PADDLE_STYLES),
        "default_paddle_colors": DEFAULT_PADDLE_COLORS,
        "defaults": DEFAULT_CONFIG,
        "world": WORLD_INFO,
    }


# ---------------------------------------------------------------------------
# WEBSOCKET DEL LOBBY
# ---------------------------------------------------------------------------
@router.websocket("/ws/lobby/{room_id}")
async def lobby_websocket(websocket: WebSocket, room_id: str):
    username = ws_username(websocket, websocket.query_params.get("username"))
    if not username:
        await websocket.close(code=4401)
        return
    username = clean_username(username, "Conjurador")
    if not await manager.connect_lobby(websocket, room_id, username):
        return

    try:
        while True:
            data = await receive_json_safe(websocket)
            if data is None:
                continue
            action = data.get("action")

            if action == "CHAT_MESSAGE":
                await manager.lobby_chat(websocket, room_id, data.get("message"))
            elif action == "UPDATE_CONFIG":
                await manager.lobby_update_config(websocket, room_id, data)
            elif action == "START_GAME":
                await manager.lobby_start_game(websocket, room_id)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"❌ Error en lobby: {e}")
    finally:
        manager.disconnect_lobby(websocket, room_id)
        await manager.broadcast_lobby_state(room_id)


# ---------------------------------------------------------------------------
# WEBSOCKET DE LA PARTIDA
# ---------------------------------------------------------------------------
@router.websocket("/ws/game/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    username = ws_username(websocket, websocket.query_params.get("username"))
    if not username:
        await websocket.close(code=4401)
        return
    username = clean_username(username, "Jugador")
    room = await manager.connect_game(websocket, room_id, username, dict(websocket.query_params))
    if room is None:
        return

    try:
        while True:
            data = await receive_json_safe(websocket)
            if data is None:
                continue
            await manager.handle_message(room, username, websocket, data)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"❌ Error en game websocket: {e}")
    finally:
        await manager.disconnect_game(room, username, websocket)
