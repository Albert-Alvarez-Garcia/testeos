import asyncio
import random
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.database import get_db_connection
from backend.security import ws_username
from backend.routers.stats import save_game_result
from backend.routers.chat_notify import announce_game

router = APIRouter(
    prefix="/api/game",
    tags=["Minijuego Adivina la Carta y Lobby"]
)

ROUND_SECONDS = 15       # duración de cada ronda
REVEAL_SECONDS = 3       # pausa mostrando la carta revelada
WIN_SCORE = 10           # puntos para ganar
EMPTY_ROOM_GRACE = 30    # segundos que se conserva una sala de juego sin nadie conectado


# ---------------------------------------------------------------------------
# Estado de una partida (una por sala). El SERVIDOR es el dueño del reloj:
# los clientes solo reciben "time_remaining" y lo pintan.
# ---------------------------------------------------------------------------
class GameRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        # username -> {"score", "streak", "answered", "ws"}  (ws=None si está desconectado)
        self.players: Dict[str, dict] = {}
        self.card: Optional[dict] = None
        self.round_number = 0
        self.round_started_at = 0.0
        self.round_ends_at = 0.0
        self.phase = "waiting"          # waiting | playing | reveal
        self.round_winner: Optional[str] = None
        self.round_over = asyncio.Event()
        self.loop_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None
        self.finished = False
        self.allowed: Optional[set] = None            # jugadores de la partida (None = abierta a todos)
        self.spectators: Dict[str, dict] = {}         # username -> {"ws"}

    def connected_players(self) -> List[dict]:
        return [p for p in self.players.values() if p["ws"] is not None]

    def time_remaining(self) -> float:
        if self.phase != "playing":
            return 0.0
        return max(0.0, self.round_ends_at - time.time())

    def snapshot(self, username: Optional[str] = None) -> dict:
        player = self.players.get(username) if username else None
        msg = {
            "type": "NEW_ROUND",
            "phase": self.phase,
            "round_number": self.round_number,
            "image_uri": self.card["image_uri"],
            "options": self.card["options"],
            "time_remaining": round(self.time_remaining(), 2),
            "round_duration": ROUND_SECONDS,
            "already_answered": bool(player and player["answered"]),
        }
        if self.phase == "reveal":
            msg["correct_answer"] = self.card["name"]
            msg["round_winner"] = self.round_winner
        return msg

    def ranking(self) -> List[dict]:
        return [
            {"username": u, "score": p["score"]}
            for u, p in sorted(self.players.items(), key=lambda kv: -kv[1]["score"])
        ]

    def scores_payload(self) -> dict:
        return {
            "type": "SCORES",
            "win_score": WIN_SCORE,
            "players": [
                {
                    "username": u,
                    "score": p["score"],
                    "streak": p["streak"],
                    "answered": p["answered"],
                    "connected": p["ws"] is not None,
                }
                for u, p in sorted(self.players.items(), key=lambda kv: -kv[1]["score"])
            ],
        }

    @staticmethod
    async def send(ws: Optional[WebSocket], message: dict):
        if ws is None:
            return
        try:
            await ws.send_json(message)
        except Exception as e:
            print(f"❌ Error enviando a jugador: {e}")

    async def broadcast(self, message: dict):
        for p in list(self.players.values()):
            await self.send(p["ws"], message)
        for s in list(self.spectators.values()):
            await self.send(s["ws"], message)

    async def broadcast_round(self):
        # Se recalcula time_remaining por jugador justo al enviar
        for u, p in list(self.players.items()):
            await self.send(p["ws"], self.snapshot(u))
        for s in list(self.spectators.values()):
            await self.send(s["ws"], self.snapshot(None))


class GameManager:
    def __init__(self):
        # --- Lobby ---
        self.lobbies: Dict[str, List[WebSocket]] = {}
        self.lobby_players: Dict[WebSocket, dict] = {}
        self.room_config: Dict[str, int] = {}
        # --- Partidas ---
        self.game_rooms: Dict[str, GameRoom] = {}
        self.pending_players: Dict[str, List[str]] = {}   # jugadores que fija el lobby al empezar

    # --- GESTIÓN DE LOBBY CON CONTROL DE DUPLICADOS ---
    async def connect_lobby(self, websocket: WebSocket, room_id: str, username: str):
        await websocket.accept()
        if room_id not in self.lobbies:
            self.lobbies[room_id] = []

        existing_ws = None
        for ws in self.lobbies[room_id]:
            if self.lobby_players.get(ws, {}).get("username") == username:
                existing_ws = ws
                break

        if existing_ws:
            self.disconnect_lobby(existing_ws, room_id)
            if room_id not in self.lobbies:
                self.lobbies[room_id] = []

        if room_id not in self.room_config:
            self.room_config[room_id] = 4
        members = self.lobbies[room_id]
        active = [w for w in members if not self.lobby_players.get(w, {}).get("spectator")]
        is_spectator = len(active) >= self.room_config[room_id]
        has_host = any(self.lobby_players.get(w, {}).get("is_host") for w in members)
        members.append(websocket)
        self.lobby_players[websocket] = {
            "username": username,
            "is_host": (not is_spectator) and not has_host,
            "spectator": is_spectator,
        }
        await self.broadcast_lobby_state(room_id)

    def disconnect_lobby(self, websocket: WebSocket, room_id: str):
        if room_id in self.lobbies:
            if websocket in self.lobbies[room_id]:
                self.lobbies[room_id].remove(websocket)

            self._rebalance(room_id)

            if not self.lobbies[room_id]:
                del self.lobbies[room_id]
                if room_id in self.room_config:
                    del self.room_config[room_id]

        if websocket in self.lobby_players:
            del self.lobby_players[websocket]

    def _rebalance(self, room_id: str):
        """Un espectador ocupa el hueco libre y siempre hay un host entre los jugadores."""
        members = self.lobbies.get(room_id, [])
        mx = self.room_config.get(room_id, 4)
        info = lambda w: self.lobby_players.get(w, {})
        for w in members:
            active = [x for x in members if not info(x).get("spectator")]
            if len(active) >= mx:
                break
            if info(w).get("spectator"):
                info(w)["spectator"] = False
        active = [x for x in members if not info(x).get("spectator")]
        if active and not any(info(x).get("is_host") for x in active):
            info(active[0])["is_host"] = True

    async def broadcast_lobby_state(self, room_id: str):
        if room_id in self.lobbies:
            players_list = [
                {
                    "username": self.lobby_players[ws]["username"],
                    "is_host": self.lobby_players[ws]["is_host"],
                    "spectator": bool(self.lobby_players[ws].get("spectator")),
                }
                for ws in self.lobbies[room_id] if ws in self.lobby_players
            ]
            message = {
                "type": "LOBBY_STATE",
                "players": players_list,
                "max_players": self.room_config.get(room_id, 4)
            }
            for connection in self.lobbies[room_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"❌ Error en lobby broadcast: {e}")

    # -----------------------------------------------------------------------
    # PARTIDA SINCRONIZADA (reloj del servidor)
    # -----------------------------------------------------------------------
    async def connect_game(self, websocket: WebSocket, room_id: str, username: str,
                           spectate_only: bool = False) -> Optional[GameRoom]:
        await websocket.accept()

        # Modo "solo ver": nunca crea una partida; si no hay una en curso, se rechaza
        if spectate_only:
            existing = self.game_rooms.get(room_id)
            if existing is None or existing.finished or existing.allowed is None:
                await websocket.close(code=4404)
                return None

        room = self.game_rooms.get(room_id)
        pending = self.pending_players.pop(room_id, None)
        if room is not None and pending is not None and room.finished:
            self._drop_game_room(room)
            room = None
        if room is None:
            room = GameRoom(room_id)
            if pending is not None:
                room.allowed = set(pending)
            self.game_rooms[room_id] = room
            room.loop_task = asyncio.create_task(self._game_loop(room))

        # Espectador: ve la partida en directo, pero el servidor nunca acepta sus respuestas
        if room.allowed is not None and username not in room.allowed:
            old = room.spectators.get(username)
            room.spectators[username] = {"ws": websocket}
            if old and old["ws"] is not websocket:
                try:
                    await old["ws"].close()
                except Exception:
                    pass
            await room.send(websocket, {"type": "ROLE", "role": "spectator"})
            if room.card is not None and room.phase != "waiting":
                await room.send(websocket, room.snapshot(None))
            await room.send(websocket, room.scores_payload())
            return room

        if room.cleanup_task:
            room.cleanup_task.cancel()
            room.cleanup_task = None

        player = room.players.get(username)
        if player:
            # Reconexión: se conservan puntos y racha, solo cambia el socket
            old_ws = player["ws"]
            player["ws"] = websocket
            if old_ws is not None and old_ws is not websocket:
                try:
                    await old_ws.close()
                except Exception:
                    pass
        else:
            room.players[username] = {
                "score": 0,
                "streak": 0,
                "answered": False,
                "ws": websocket,
            }

        await room.send(websocket, {"type": "ROLE", "role": "player"})
        # Estado actual con el tiempo restante REAL (igual para todos)
        if room.card is not None and room.phase != "waiting":
            await room.send(websocket, room.snapshot(username))
        await room.broadcast(room.scores_payload())
        return room

    async def disconnect_game(self, room: GameRoom, username: str, websocket: WebSocket):
        spec = room.spectators.get(username)
        if spec is not None and username not in room.players:
            if spec["ws"] is websocket:
                del room.spectators[username]
            return

        player = room.players.get(username)
        if player and player["ws"] is websocket:
            player["ws"] = None

        if room.finished:
            return

        await room.broadcast(room.scores_payload())

        connected = room.connected_players()
        if not connected:
            if room.cleanup_task is None:
                room.cleanup_task = asyncio.create_task(self._cleanup_later(room))
        elif room.phase == "playing" and all(p["answered"] for p in connected):
            # Los que quedan ya habían respondido: no esperamos más
            room.round_over.set()

    async def _cleanup_later(self, room: GameRoom):
        try:
            await asyncio.sleep(EMPTY_ROOM_GRACE)
        except asyncio.CancelledError:
            return
        if not room.connected_players():
            self._drop_game_room(room)

    def _drop_game_room(self, room: GameRoom):
        if self.game_rooms.get(room.room_id) is room:
            del self.game_rooms[room.room_id]
        task = room.loop_task
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()

    async def _game_loop(self, room: GameRoom):
        """Un único bucle por sala: arranca ronda, espera fin, revela, repite."""
        try:
            next_card_task: Optional[asyncio.Task] = None
            while True:
                # La carta de esta ronda ya se pidió a la BD durante la ronda anterior,
                # así que entre rondas solo se espera la pausa de revelación.
                if next_card_task is not None:
                    card = await next_card_task
                    next_card_task = None
                else:
                    card = await asyncio.to_thread(get_random_card_with_options)
                if not card:
                    await asyncio.sleep(2)
                    continue

                # --- Inicio de ronda ---
                room.card = card
                room.round_number += 1
                room.round_winner = None
                room.round_over.clear()
                for p in room.players.values():
                    p["answered"] = False
                room.round_started_at = time.time()
                room.round_ends_at = room.round_started_at + ROUND_SECONDS
                room.phase = "playing"

                # Precarga de la siguiente carta mientras se juega esta ronda
                next_card_task = asyncio.create_task(asyncio.to_thread(get_random_card_with_options))

                await room.broadcast_round()
                await room.broadcast(room.scores_payload())

                # --- Espera: acierto, todos respondieron o se acaba el tiempo ---
                timeout = max(0.0, room.round_ends_at - time.time())
                try:
                    await asyncio.wait_for(room.round_over.wait(), timeout=timeout)
                except asyncio.TimeoutError:
                    pass

                # --- Revelación ---
                room.phase = "reveal"
                await room.broadcast({
                    "type": "ROUND_END",
                    "correct_answer": card["name"],
                    "round_winner": room.round_winner,
                })
                await room.broadcast(room.scores_payload())

                leader = max(room.players.items(), key=lambda kv: kv[1]["score"], default=None)
                if leader and leader[1]["score"] >= WIN_SCORE:
                    room.finished = True
                    try:
                        await asyncio.to_thread(save_game_result, "guess_card", room.room_id, room.ranking(), leader[0])
                    except Exception as e:
                        print(f"⚠️ No se pudo guardar el resultado: {e}")
                    try:
                        await announce_game("Adivina la Carta", leader[0], room.ranking())
                    except Exception as e:
                        print(f"⚠️ No se pudo avisar en el chat: {e}")
                    await room.broadcast({
                        "type": "GAME_OVER",
                        "winner": leader[0],
                        "ranking": room.ranking(),
                    })
                    await asyncio.sleep(2)
                    self._drop_game_room(room)
                    return

                await asyncio.sleep(REVEAL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"❌ Error en el bucle de juego ({room.room_id}): {e}")

    async def handle_answer(self, room: GameRoom, username: str, websocket: WebSocket, answer: str):
        player = room.players.get(username)
        if not player or player["ws"] is not websocket:
            return
        if room.phase != "playing" or player["answered"] or room.card is None:
            return

        now = time.time()
        if now > room.round_ends_at:
            return  # llegó tarde: el reloj del servidor manda

        player["answered"] = True
        is_correct = answer.strip().lower() == room.card["name"].strip().lower()
        points = 0

        if is_correct:
            elapsed = now - room.round_started_at
            base_pts = 3 if elapsed <= 5 else 2 if elapsed <= 10 else 1
            streak_bonus = 1 if player["streak"] > 0 else 0
            points = base_pts + streak_bonus
            player["score"] += points
            player["streak"] += 1
            room.round_winner = username
        else:
            player["streak"] = 0

        await room.send(websocket, {
            "type": "ANSWER_RESULT",
            "correct": is_correct,
            "points_earned": points,
            "total_score": player["score"],
            "streak": player["streak"],
        })
        await room.broadcast(room.scores_payload())

        connected = room.connected_players()
        if is_correct or all(p["answered"] for p in connected):
            room.round_over.set()


manager = GameManager()


def get_random_card_with_options():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT c.name, p.image_uri 
            FROM cards c
            JOIN printings p ON p.card_id = c.id
            WHERE p.image_uri IS NOT NULL AND p.image_uri != ''
            ORDER BY RANDOM() LIMIT 1;
        """)
        correct = cursor.fetchone()
        if not correct:
            return None

        correct_name = correct["name"]
        image_uri = correct["image_uri"]

        # Tres nombres distintos al azar. Antes: SELECT DISTINCT sobre un subselect ORDER BY RANDOM();
        # el DISTINCT reordena los nombres y descarta el azar, así que el LIMIT 3 devolvía
        # siempre los mismos (los primeros por orden interno). Ahora el azar se aplica DESPUÉS de agrupar.
        cursor.execute("""
            SELECT name FROM cards
            WHERE LOWER(name) != LOWER(%s)
            GROUP BY name
            ORDER BY RANDOM()
            LIMIT 3;
        """, (correct_name,))
        distractors = [row["name"] for row in cursor.fetchall()]

        options = distractors + [correct_name]
        random.shuffle(options)

        return {
            "name": correct_name,
            "image_uri": image_uri,
            "options": options
        }
    except Exception as e:
        print(f"❌ Error obteniendo carta: {e}")
        return None
    finally:
        cursor.close()
        conn.close()


# --- ENDPOINT REST PARA LISTAR SALAS ACTIVAS ---
@router.get("/rooms")
def get_active_rooms():
    rooms = {}
    for room_id, members in manager.lobbies.items():
        active = [w for w in members if not manager.lobby_players.get(w, {}).get("spectator")]
        rooms[room_id] = {
            "room_id": room_id,
            "current_players": len(active),
            "max_players": manager.room_config.get(room_id, 4),
            "in_game": False,
            "spectators": len(members) - len(active),
        }
    # Partidas ya empezadas: siguen apareciendo (aunque el lobby ya esté vacío) para poder verlas como espectador
    for room_id, game in manager.game_rooms.items():
        if game.finished or game.allowed is None:
            continue
        entry = rooms.setdefault(room_id, {"room_id": room_id, "current_players": len(game.players),
                                           "max_players": len(game.allowed)})
        entry.update(in_game=True, round=game.round_number, spectators=len(game.spectators),
                     players=sorted(game.players))
    return {"rooms": list(rooms.values())}


# --- WEBSOCKET DEL LOBBY ---
@router.websocket("/ws/lobby/{room_id}")
async def lobby_websocket(websocket: WebSocket, room_id: str):
    username = ws_username(websocket, websocket.query_params.get("username", "Conjurador"))
    if not username:
        await websocket.close(code=4401)
        return
    await manager.connect_lobby(websocket, room_id, username)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "CHAT_MESSAGE":
                chat_msg = {
                    "type": "CHAT_MESSAGE",
                    "username": username,
                    "message": data.get("message", "")
                }
                if room_id in manager.lobbies:
                    for conn in manager.lobbies[room_id]:
                        await conn.send_json(chat_msg)

            elif action == "UPDATE_CONFIG":
                player_info = manager.lobby_players.get(websocket, {})
                if player_info.get("is_host"):
                    new_max = max(1, min(4, int(data.get("max_players", 4))))
                    active = [w for w in manager.lobbies.get(room_id, [])
                              if not manager.lobby_players.get(w, {}).get("spectator")]
                    if new_max >= len(active):
                        manager.room_config[room_id] = new_max
                        manager._rebalance(room_id)
                    await manager.broadcast_lobby_state(room_id)

            elif action == "START_GAME":
                player_info = manager.lobby_players.get(websocket, {})
                if player_info.get("is_host"):
                    manager.pending_players[room_id] = [
                        manager.lobby_players[w]["username"] for w in manager.lobbies.get(room_id, [])
                        if w in manager.lobby_players and not manager.lobby_players[w].get("spectator")]
                    start_signal = {"type": "START_GAME"}
                    if room_id in manager.lobbies:
                        for conn in manager.lobbies[room_id]:
                            await conn.send_json(start_signal)

    except WebSocketDisconnect:
        manager.disconnect_lobby(websocket, room_id)
        await manager.broadcast_lobby_state(room_id)
    except Exception as e:
        print(f"❌ Error en lobby: {e}")
        manager.disconnect_lobby(websocket, room_id)
        await manager.broadcast_lobby_state(room_id)


# --- WEBSOCKET DEL JUEGO ---
@router.websocket("/ws/game/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    username = ws_username(websocket, websocket.query_params.get("username", "Jugador"))
    if not username:
        await websocket.close(code=4401)
        return
    room = await manager.connect_game(websocket, room_id, username,
                                      spectate_only=websocket.query_params.get("spectate") == "1")
    if room is None:
        return

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "ANSWER":
                await manager.handle_answer(room, username, websocket, str(data.get("answer", "")))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"❌ Error en game websocket: {e}")
    finally:
        await manager.disconnect_game(room, username, websocket)