// pong_Lobby.jsx · Pantalla de lobby.
//   Entry -> elegir nombre y modo (Local / Online) y entrar en una sala
//   Room  -> sala conectada: jugadores, configuración, chat y botón de empezar
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, accentVars, describeWin, httpUrl } from "./pong_config.js";
import useLobbySocket from "./pong_useLobbySocket.js";
import IsoPreview from "./pong_IsoPreview.jsx";
import LobbyConfig from "./pong_LobbyConfig.jsx";
import { RadioGroup } from "./pong_ui.jsx";

const MODE_OPTIONS = [
  { value: "local", label: "Local", hint: "Dos jugadores en este PC" },
  { value: "online", label: "Online", hint: "1 contra 1, cada uno en su PC" },
];

const STATUS_TEXT = {
  connecting: "Conectando…",
  open: "Conectado",
  reconnecting: "Conexión perdida. Reconectando…",
};

const randomCode = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 6)}`;
const cleanRoom = (raw) => raw.trim().replace(/\s+/g, "-").slice(0, 30);

// ===========================================================================
export default function PongLobby({ username, onUsernameChange, initialJoin, onStartGame }) {
  // join = { roomId, mode } cuando estamos dentro de una sala
  const [join, setJoin] = useState(initialJoin ? { roomId: initialJoin.roomId, mode: initialJoin.mode } : null);

  if (!join) {
    return (
      <Entry
        username={username}
        onJoin={(name, target) => {
          onUsernameChange(name);
          setJoin(target);
        }}
      />
    );
  }

  return (
    <Room
      key={`${join.roomId}:${username}`}
      username={username}
      join={join}
      initialConfig={initialJoin?.roomId === join.roomId ? initialJoin.config : null}
      onLeave={() => setJoin(null)}
      onStartGame={onStartGame}
    />
  );
}

// ===========================================================================
function Entry({ username, onJoin }) {
  const urlRoom = new URLSearchParams(window.location.search).get("room") || "";
  const [name, setName] = useState(username);
  const [mode, setMode] = useState(urlRoom ? "online" : "local");
  const [roomInput, setRoomInput] = useState(urlRoom);
  const [rooms, setRooms] = useState([]);
  const [roomsFailed, setRoomsFailed] = useState(false);

  // Salas online abiertas (se refresca cada 3 s mientras el modo online está elegido)
  useEffect(() => {
    if (mode !== "online") return undefined;
    let stopped = false;

    async function load() {
      try {
        const res = await fetch(httpUrl("/api/pong/rooms"));
        const data = await res.json();
        if (stopped) return;
        setRooms(data.rooms.filter((r) => r.mode === "online" && r.joinable));
        setRoomsFailed(false);
      } catch {
        if (!stopped) setRoomsFailed(true);
      }
    }

    load();
    const id = setInterval(load, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [mode]);

  const finalName = () => name.trim().slice(0, 20) || "Conjurador";

  function submit(event) {
    event.preventDefault();
    const roomId = mode === "local" ? randomCode("local") : cleanRoom(roomInput) || randomCode("sala");
    onJoin(finalName(), { roomId, mode });
  }

  return (
    <main className="lobby" style={accentVars(DEFAULT_CONFIG.ball_mana)}>
      <section className="lobby-stage">
        <IsoPreview mana={DEFAULT_CONFIG.ball_mana} table={DEFAULT_CONFIG.table_theme} />
      </section>

      <section className="lobby-panel">
        <header className="lobby-head">
          <h1 className="title">Pong isométrico</h1>
          <p className="lead">Elige cómo quieres jugar.</p>
        </header>

        <form className="block" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="player-name">Tu nombre</label>
            <input
              id="player-name"
              className="text-input"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <RadioGroup
            name="mode"
            legend="Modo de juego"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
            variant="seg"
            renderOption={(o) => (
              <>
                <span className="seg-label">{o.label}</span>
                <span className="seg-hint">{o.hint}</span>
              </>
            )}
          />

          {mode === "online" && (
            <div className="field">
              <label className="field-label" htmlFor="room-code">Código de sala</label>
              <input
                id="room-code"
                className="text-input"
                type="text"
                maxLength={30}
                placeholder="Déjalo vacío para crear una sala nueva"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
              />

              <h2 className="sub-title">Salas abiertas</h2>
              {roomsFailed ? (
                <p className="note note-warn">
                  No se puede contactar con el servidor. Comprueba que el backend está en marcha.
                </p>
              ) : rooms.length === 0 ? (
                <p className="note">No hay salas abiertas. Crea la tuya con un código.</p>
              ) : (
                <ul className="room-list">
                  {rooms.map((r) => (
                    <li key={r.room_id}>
                      <button
                        type="button"
                        className="room-item"
                        onClick={() => onJoin(finalName(), { roomId: r.room_id, mode: "online" })}
                      >
                        <span className="room-name">{r.room_id}</span>
                        <span className="room-meta">
                          {describeWin(r)} · {r.current_players}/{r.max_players}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary">
            {mode === "local" ? "Crear partida local" : "Entrar a la sala"}
          </button>
        </form>
      </section>
    </main>
  );
}

// ===========================================================================
function Room({ username, join, initialConfig, onLeave, onStartGame }) {
  const { status, lobby, chat, error, clearError, send } = useLobbySocket({
    roomId: join.roomId,
    username,
    onStartGame,
  });

  const config = lobby?.config || DEFAULT_CONFIG;
  const players = lobby?.players || [];
  const me = players.find((p) => p.username === username);
  const isHost = !!me?.is_host;
  const isLocal = config.mode === "local";
  const maxPlayers = lobby?.max_players || (join.mode === "local" ? 1 : 2);

  // Al recibir el primer estado, el anfitrión impone el modo elegido y recupera la
  // configuración de la partida anterior (el servidor borra la sala cuando el lobby se vacía).
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!lobby || appliedRef.current) return;
    appliedRef.current = true;
    if (isHost) {
      send({ action: "UPDATE_CONFIG", ...(initialConfig || {}), mode: join.mode });
    }
  }, [lobby, isHost, initialConfig, join.mode, send]);

  if (status === "rejected" || status === "replaced") {
    return (
      <main className="lobby lobby-solo" style={accentVars(config.ball_mana)}>
        <section className="lobby-panel lobby-panel-solo">
          <h1 className="title">{status === "rejected" ? "No se puede entrar" : "Sala abierta en otra pestaña"}</h1>
          <p className="lead">
            {status === "rejected"
              ? error?.message || "La sala está llena o no admite más jugadores."
              : "Has abierto esta sala con el mismo nombre en otra pestaña, y esa es la que sigue activa."}
          </p>
          <button type="button" className="btn btn-primary" onClick={onLeave}>Volver al inicio</button>
        </section>
      </main>
    );
  }

  let startLabel = "Conectando…";
  if (status === "open" && lobby) {
    if (!isHost) startLabel = "Esperando al anfitrión";
    else if (!lobby.can_start) startLabel = "Esperando al segundo jugador";
    else startLabel = "Empezar partida";
  }
  const canStart = status === "open" && isHost && !!lobby?.can_start;

  return (
    <main className="lobby" style={accentVars(config.ball_mana)}>
      <section className="lobby-stage">
        <IsoPreview mana={config.ball_mana} table={config.table_theme}>
          <div className="stage-caption">
            <p className="stage-win">{describeWin(config)}</p>
            <p className="stage-sub">
              {isLocal ? "Jugador 1: W y S. Jugador 2: ↑ y ↓." : "Cada jugador controla su pala con W y S o con ↑ y ↓."}
            </p>
          </div>
        </IsoPreview>
      </section>

      <section className="lobby-panel">
        <header className="lobby-head">
          <div className="head-row">
            <h1 className="title">{isLocal ? "Partida local" : join.roomId}</h1>
            <button type="button" className="btn btn-ghost" onClick={onLeave}>Salir de la sala</button>
          </div>
          <p className={`status status-${status}`} role="status" aria-live="polite">
            {STATUS_TEXT[status] || ""}
          </p>
        </header>

        {error && (
          <div className="toast" role="alert">
            <span>{error.message}</span>
            <button type="button" className="toast-close" onClick={clearError} aria-label="Cerrar aviso">×</button>
          </div>
        )}

        <Roster players={players} maxPlayers={maxPlayers} username={username} isLocal={isLocal} />

        {lobby ? (
          <LobbyConfig config={config} isHost={isHost} send={send} />
        ) : (
          <p className="note">Cargando la sala…</p>
        )}

        {!isLocal && <Chat messages={chat} username={username} send={send} disabled={status !== "open"} />}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canStart}
            onClick={() => send({ action: "START_GAME" })}
          >
            {startLabel}
          </button>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
function Roster({ players, maxPlayers, username, isLocal }) {
  if (isLocal) {
    return (
      <section className="block" aria-labelledby="roster-title">
        <h2 id="roster-title" className="block-title">Jugadores</h2>
        <ul className="roster">
          <li className="roster-item">
            <span className="roster-name">Jugador 1</span>
            <span className="roster-tag">W y S</span>
          </li>
          <li className="roster-item">
            <span className="roster-name">Jugador 2</span>
            <span className="roster-tag">↑ y ↓</span>
          </li>
        </ul>
      </section>
    );
  }

  const empty = Math.max(0, maxPlayers - players.length);
  return (
    <section className="block" aria-labelledby="roster-title">
      <h2 id="roster-title" className="block-title">Jugadores</h2>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.username} className="roster-item">
            <span className="roster-name">
              {p.username}
              {p.username === username ? " (tú)" : ""}
            </span>
            {p.is_host && <span className="roster-tag">Anfitrión</span>}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="roster-item roster-empty">
            <span className="roster-name">Esperando jugador…</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
function Chat({ messages, username, send, disabled }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(event) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (send({ action: "CHAT_MESSAGE", message })) setText("");
  }

  return (
    <section className="block" aria-labelledby="chat-title">
      <h2 id="chat-title" className="block-title">Chat</h2>
      <ul className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">Aún no hay mensajes.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.username === username ? "chat-msg chat-mine" : "chat-msg"}>
            <span className="chat-user">{m.username}</span>
            <span className="chat-text">{m.message}</span>
          </li>
        ))}
      </ul>
      <form className="chat-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">Mensaje</label>
        <input
          id="chat-input"
          className="text-input"
          type="text"
          maxLength={200}
          placeholder="Escribe un mensaje"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost" disabled={disabled || !text.trim()}>Enviar</button>
      </form>
    </section>
  );
}
