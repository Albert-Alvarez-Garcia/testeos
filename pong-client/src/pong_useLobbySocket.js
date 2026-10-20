// pong_useLobbySocket.js · Conexión al lobby con reconexión automática.
//
// Estados de `status`:
//   connecting   -> abriendo la primera conexión
//   open         -> conectado
//   reconnecting -> se cayó; reintentando con espera creciente
//   rejected     -> el servidor no te deja entrar (sala llena); no se reintenta
//   replaced     -> abriste la misma sala con el mismo nombre en otra pestaña; no se reintenta
import { useCallback, useEffect, useRef, useState } from "react";
import { lobbyWsUrl } from "./pong_config.js";

const MAX_CHAT = 100;
const ERROR_TTL_MS = 5000;

export default function useLobbySocket({ roomId, username, onStartGame }) {
  const [status, setStatus] = useState("connecting");
  const [lobby, setLobby] = useState(null);
  const [chat, setChat] = useState([]);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const chatIdRef = useRef(0);
  const startRef = useRef(onStartGame);

  useEffect(() => {
    startRef.current = onStartGame;
  }, [onStartGame]);

  useEffect(() => {
    let closedByUs = false;
    let attempt = 0;
    let retryTimer = null;

    function connect() {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const ws = new WebSocket(lobbyWsUrl(roomId, username));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (data.type) {
          case "LOBBY_STATE":
            setLobby(data);
            break;
          case "CHAT_MESSAGE":
            setChat((prev) =>
              [...prev, { id: ++chatIdRef.current, username: data.username, message: data.message }].slice(-MAX_CHAT)
            );
            break;
          case "START_GAME":
            startRef.current?.(data);
            break;
          case "ERROR":
            setError({ code: data.code, message: data.message });
            break;
          default:
            break;
        }
      };

      ws.onclose = (event) => {
        if (closedByUs) return;
        if (event.code === 1008) {
          setStatus("rejected");
          return;
        }
        if (event.code === 4000) {
          setStatus("replaced");
          return;
        }
        setStatus("reconnecting");
        attempt += 1;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempt - 1), 8000));
      };
    }

    connect();

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId, username]);

  // Los avisos de error desaparecen solos
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(null), ERROR_TTL_MS);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { status, lobby, chat, error, clearError, send };
}
