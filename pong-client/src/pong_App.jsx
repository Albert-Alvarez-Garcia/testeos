// pong_App.jsx · Raíz de la aplicación con motor isométrico en Canvas 2D.
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, DEFAULT_PADDLE_COLORS, MANA, TABLES, accentVars, describeWin, formatTime, gameWsUrl } from "./pong_config.js";
import PongLobby from "./pong_Lobby.jsx";
import { probeOrb } from "./pong_orbs.js";

const SESSION_KEY = "pong_session";
const NAME_KEY = "pong_username";

function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {}
}

function readInitialName() {
  const fromUrl = new URLSearchParams(window.location.search).get("user");
  if (fromUrl) writeStorage(sessionStorage, NAME_KEY, fromUrl.slice(0, 20));
  // Nombre por pestaña. Antes el valor por defecto era siempre "Conjurador": dos jugadores con el mismo
  // nombre se expulsaban entre sí ("Sala abierta en otra pestaña"). Ahora se genera uno único.
  let name = readStorage(sessionStorage, NAME_KEY);
  if (!name) {
    name = `Conjurador_${Math.floor(100 + Math.random() * 900)}`;
    writeStorage(sessionStorage, NAME_KEY, name);
  }
  return name;
}

function readSession() {
  const raw = readStorage(sessionStorage, SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Botón fijo para volver al inicio del portal (mismo aspecto que "Volver al Portal" del resto de la web).
// Usa una ruta absoluta porque Pong vive bajo /pong/. Al navegar se desmonta la app y se cierra el WebSocket.
const HOME_URL = "/index.html";
function HomeButton() {
  return (
    <a href={HOME_URL} className="btn btn-ghost home-link" title="Volver al inicio">
      <span aria-hidden="true">←</span> Volver al Inicio
    </a>
  );
}

export default function PongApp() {
  const [username, setUsername] = useState(readInitialName);
  const [session, setSession] = useState(readSession);
  const [lastJoin, setLastJoin] = useState(null);

  const changeUsername = useCallback((name) => {
    setUsername(name);
    writeStorage(sessionStorage, NAME_KEY, name);
    writeStorage(localStorage, NAME_KEY, name);
  }, []);

  const handleStartGame = useCallback(
    (payload) => {
      const next = {
        roomId: payload.room_id,
        mode: payload.mode,
        config: payload.config,
        host: payload.host,
        players: payload.players,
        username: payload.you || username,
      };
      writeStorage(sessionStorage, SESSION_KEY, JSON.stringify(next));
      setSession(next);
    },
    [username]
  );

  const leaveGame = useCallback(() => {
    if (session) setLastJoin({ roomId: session.roomId, mode: session.mode, config: session.config });
    writeStorage(sessionStorage, SESSION_KEY, null);
    setSession(null);
  }, [session]);

  return (
    <>
      <HomeButton />
      {session ? (
        <PongGame session={session} onExit={leaveGame} />
      ) : (
        <PongLobby
          username={username}
          onUsernameChange={changeUsername}
          initialJoin={lastJoin}
          onStartGame={handleStartGame}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Componente de juego con Canvas 2D y Proyección Isométrica Exacta
// ---------------------------------------------------------------------------
function PongGame({ session, onExit }) {
  const canvasRef = useRef(null);
  const [scoreLeft, setScoreLeft] = useState(0);
  const [scoreRight, setScoreRight] = useState(0);
  const [roomStatus, setRoomStatus] = useState("Conectando a la arena...");
  const [phase, setPhase] = useState("waiting");
  const [countdown, setCountdown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);

  const { roomId, mode, config, username } = session;
  const cfg = config || DEFAULT_CONFIG;
  const t = TABLES[cfg.table_theme] || TABLES.felt_green;
  const m = MANA[cfg.ball_mana] || MANA.red;

  // "target" lo escribe el servidor; "shown" es lo que se dibuja (suavizado entre mensajes)
  const gameStateRef = useRef({
    target: { ball: { x: 400, y: 240 }, paddles: [240, 240] },
    shown: { ball: { x: 400, y: 240 }, paddles: [240, 240] },
    fresh: true,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const state = gameStateRef.current;

    let ws = null;
    let closedByUs = false;
    let finished = false;
    let attempt = 0;
    let retryTimer = null;
    let animationFrameId = null;
    let lastFrame = performance.now();
    let lastSent = "";
    const keys = new Set();
    const GAME_KEYS = new Set(["w", "s", "arrowup", "arrowdown"]);
    let orbImage = null;
    probeOrb(cfg.ball_mana).then((img) => { orbImage = img; });

    // ---------- Entradas: solo se envían cuando cambian (+ refresco mientras se mueve) ----------
    const dir = (up, down) => (keys.has(up) ? -1 : 0) + (keys.has(down) ? 1 : 0);
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));

    function sendInputs(force = false) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const msgs =
        mode === "local"
          ? [
              { action: "INPUT", player: 1, direction: dir("w", "s") },
              { action: "INPUT", player: 2, direction: dir("arrowup", "arrowdown") },
            ]
          : [{ action: "INPUT", direction: clamp1(dir("w", "s") + dir("arrowup", "arrowdown")) }];
      const key = JSON.stringify(msgs);
      if (!force && key === lastSent) return;
      lastSent = key;
      msgs.forEach((msg) => ws.send(JSON.stringify(msg)));
    }

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (!GAME_KEYS.has(k)) return;
      e.preventDefault(); // las flechas no deben hacer scroll
      if (!keys.has(k)) {
        keys.add(k);
        sendInputs();
      }
    };
    const onKeyUp = (e) => {
      if (keys.delete(e.key.toLowerCase())) sendInputs();
    };
    const onBlur = () => {
      if (keys.size) {
        keys.clear();
        sendInputs();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    // mientras hay una tecla pulsada se reenvía 10 veces/s (por si el servidor reinicia la dirección entre rondas)
    const inputInterval = setInterval(() => { if (keys.size) sendInputs(true); }, 100);

    // ---------- Conexión con reconexión automática ----------
    function connect() {
      ws = new WebSocket(gameWsUrl(roomId, username));

      ws.onopen = () => {
        attempt = 0;
        lastSent = "";
        setRoomStatus(`🟢 Conectado a la sala ${roomId}`);
        sendInputs(true);
      };

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "STATE") {
          setPhase(data.phase);
          setCountdown(data.countdown || 0);
          const left = data.time_left ?? data.time_remaining;
          setTimeLeft(typeof left === "number" ? left : null);
          if (data.ball) state.target.ball = data.ball;
          if (data.paddles) state.target.paddles = data.paddles;
          if (state.fresh && data.ball && data.paddles) {
            state.shown = { ball: { x: data.ball.x, y: data.ball.y }, paddles: [...data.paddles] };
            state.fresh = false;
          }
          if (data.scores) {
            setScoreLeft(data.scores[0]);
            setScoreRight(data.scores[1]);
          }
        } else if (data.type === "GAME_OVER") {
          finished = true;
          setGameOverData(data);
        }
      };

      ws.onclose = (event) => {
        if (closedByUs || finished) return;
        if (event.code === 1008 || event.code === 4000) {
          setRoomStatus("🔴 No se puede continuar en esta sala.");
          return;
        }
        setRoomStatus("🔴 Conexión perdida. Reconectando...");
        attempt += 1;
        retryTimer = setTimeout(connect, Math.min(500 * 2 ** (attempt - 1), 4000));
      };
    }
    connect();

    // ---------- Proyección isométrica ----------
    // Plano (800x480) -> pantalla (canvas 900x500). El centro vertical (232) deja sitio al grosor de la mesa.
    function toIso(x, y) {
      const rx = x - 400;
      const ry = y - 240;
      return { x: 450 + (rx - ry) * 0.62, y: 232 + (rx + ry) * 0.31 };
    }

    const withAlpha = (hex, a) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };

    // Caja con grosor: caras laterales (+x y +y) más oscuras y cara superior elevada `h` píxeles
    function box(x0, y0, x1, y1, h, color) {
      const a = toIso(x0, y0), b = toIso(x1, y0), c = toIso(x1, y1), d = toIso(x0, y1);
      const face = (pts, fill) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      [[[b.x, b.y], [c.x, c.y], [c.x, c.y - h], [b.x, b.y - h]], [[d.x, d.y], [c.x, c.y], [c.x, c.y - h], [d.x, d.y - h]]].forEach((side) => {
        face(side, color);
        face(side, "rgba(0,0,0,0.38)");
      });
      face([[a.x, a.y - h], [b.x, b.y - h], [c.x, c.y - h], [d.x, d.y - h]], color);
    }

    const renderLoop = (now) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      // Suavizado hacia lo último recibido del servidor (si hay un salto grande -p. ej. al sacar- se salta directo)
      const k = 1 - Math.exp(-dt * 28);
      const { target, shown } = state;
      if (Math.hypot(target.ball.x - shown.ball.x, target.ball.y - shown.ball.y) > 120) {
        shown.ball.x = target.ball.x;
        shown.ball.y = target.ball.y;
      } else {
        shown.ball.x += (target.ball.x - shown.ball.x) * k;
        shown.ball.y += (target.ball.y - shown.ball.y) * k;
      }
      shown.paddles[0] += (target.paddles[0] - shown.paddles[0]) * k;
      shown.paddles[1] += (target.paddles[1] - shown.paddles[1]) * k;

      // 1. Fondo
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#12101c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Mesa: grosor + tapete
      const corners = [toIso(0, 0), toIso(800, 0), toIso(800, 480), toIso(0, 480)];
      const path = (dy) => {
        ctx.beginPath();
        corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)));
        ctx.closePath();
      };
      ctx.lineJoin = "round";
      ctx.lineWidth = 8;
      ctx.strokeStyle = t.rail;
      ctx.fillStyle = t.rail;
      path(16);
      ctx.fill();
      ctx.stroke();
      [1, 2, 3].forEach((i) => { // aristas verticales de las esquinas visibles
        ctx.beginPath();
        ctx.moveTo(corners[i].x, corners[i].y);
        ctx.lineTo(corners[i].x, corners[i].y + 16);
        ctx.stroke();
      });
      const c0 = toIso(400, 240);
      const felt = ctx.createRadialGradient(c0.x, c0.y, 20, c0.x, c0.y, 380);
      felt.addColorStop(0, t.felt || "#23805a");
      felt.addColorStop(1, t.felt2 || t.felt || "#165038");
      path(0);
      ctx.fillStyle = felt;
      ctx.fill();
      ctx.stroke();

      // 3. Línea central y porterías (con el color de cada pala)
      const netTop = toIso(400, 0);
      const netBottom = toIso(400, 480);
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.moveTo(netTop.x, netTop.y);
      ctx.lineTo(netBottom.x, netBottom.y);
      ctx.strokeStyle = t.line || "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      [[0, DEFAULT_PADDLE_COLORS[0]], [800, DEFAULT_PADDLE_COLORS[1]]].forEach(([gx, col]) => {
        const g0 = toIso(gx, 0);
        const g1 = toIso(gx, 480);
        ctx.beginPath();
        ctx.moveTo(g0.x, g0.y);
        ctx.lineTo(g1.x, g1.y);
        ctx.strokeStyle = withAlpha(col, 0.85);
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // 4. Objetos ordenados por profundidad (x + y): palas con grosor y pelota (orbe de maná elegido)
      const bp = toIso(shown.ball.x, shown.ball.y);
      const lift = 12;
      const drawBall = () => {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.ellipse(bp.x + 3, bp.y + 2, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(bp.x, bp.y - lift, 2, bp.x, bp.y - lift, 36);
        glow.addColorStop(0, withAlpha(m.glow, 0.5));
        glow.addColorStop(1, withAlpha(m.glow, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y - lift, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        if (orbImage) {
          const r = 17;
          ctx.drawImage(orbImage, bp.x - r, bp.y - lift - r, r * 2, r * 2);
        } else {
          const orb = ctx.createRadialGradient(bp.x - 3, bp.y - lift - 4, 1, bp.x, bp.y - lift, 12);
          orb.addColorStop(0, m.hi);
          orb.addColorStop(0.45, m.base);
          orb.addColorStop(1, m.dark);
          ctx.beginPath();
          ctx.arc(bp.x, bp.y - lift, 11, 0, Math.PI * 2);
          ctx.fillStyle = orb;
          ctx.fill();
        }
      };
      [
        { d: 24 + shown.paddles[0], draw: () => box(17, shown.paddles[0] - 45, 31, shown.paddles[0] + 45, 14, DEFAULT_PADDLE_COLORS[0]) },
        { d: 776 + shown.paddles[1], draw: () => box(769, shown.paddles[1] - 45, 783, shown.paddles[1] + 45, 14, DEFAULT_PADDLE_COLORS[1]) },
        { d: shown.ball.x + shown.ball.y, draw: drawBall },
      ].sort((a, b) => a.d - b.d).forEach((o) => o.draw());

      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      clearInterval(inputInterval);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(animationFrameId);
      if (ws) ws.close();
    };
  }, [roomId, mode, username, t, m]);

  return (
    <main className="scene scene-game" style={accentVars(cfg.ball_mana)}>
      <div className="arena">
        <header className="pong-head">
          <div className="pong-room">
            <h1 className="title">Duelo Isométrico · {roomId}</h1>
            <p className="status status-open">{roomStatus}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onExit}>Abandonar</button>
        </header>

        <div className="pong-scoreboard plate plate-sm">
          <div className="pong-side" style={{ "--pip": DEFAULT_PADDLE_COLORS[0] }}>
            <span className="pong-label">Jugador 1</span>
            <span className="pong-score">{scoreLeft}</span>
          </div>
          <div className="pong-center">
            <span className="pong-vs">VS</span>
            <span className="pong-rule">{timeLeft != null ? formatTime(timeLeft) : describeWin(cfg)}</span>
          </div>
          <div className="pong-side" style={{ "--pip": DEFAULT_PADDLE_COLORS[1] }}>
            <span className="pong-label">Jugador 2</span>
            <span className="pong-score">{scoreRight}</span>
          </div>
        </div>

        <div className="pong-stage plate plate-frame">
          <div className="pong-window">
            <canvas ref={canvasRef} width="900" height="500" className="pong-canvas" />
          </div>
        </div>

        <div className="pong-banner" role="status">
          {phase === "countdown" && <span key={Math.ceil(countdown)}>{`¡Comienza en ${Math.ceil(countdown)}!`}</span>}
          {phase === "paused" && <span>PARTIDA PAUSADA (Esperando jugador...)</span>}
        </div>

        <p className="pong-hint">
          {mode === "local" ? (
            <>
              <span><kbd>W</kbd> <kbd>S</kbd> Jugador 1</span>
              <span><kbd>↑</kbd> <kbd>↓</kbd> Jugador 2</span>
            </>
          ) : (
            <span><kbd>W</kbd> <kbd>S</kbd> o <kbd>↑</kbd> <kbd>↓</kbd> para mover tu pala</span>
          )}
        </p>
      </div>

      {gameOverData && (
        <div className="pong-overlay">
          <div className="pong-modal plate" role="dialog" aria-modal="true" aria-labelledby="over-title">
            <h2 id="over-title" className="title">Duelo finalizado</h2>
            <p className="pong-winner-label">Vencedor</p>
            <p className="pong-winner">{gameOverData.winner || "Empate"}</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onExit}>Volver al lobby</button>
          </div>
        </div>
      )}
    </main>
  );
}
