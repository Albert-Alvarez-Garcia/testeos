// pong_config.js · Constantes compartidas entre el lobby y el juego.
// Los valores de límites y opciones deben coincidir con pong_game.py.

const loc = typeof window !== "undefined"
  ? window.location
  : { protocol: "http:", hostname: "localhost", host: "localhost:8000" };

const IS_HTTPS = loc.protocol === "https:";

// Host del backend. Cámbialo con VITE_PONG_API_HOST en un .env (p. ej. "192.168.1.20:8000").
// Por defecto:
//   · https -> mismo origen que la web (p. ej. localhost:8443). Nginx hace de proxy hacia la API,
//              así el TLS lo termina Nginx y no hay contenido mixto ni CORS.
//   · http  -> backend directo en el puerto 8000 del mismo host (red local / desarrollo).
//export const API_HOST =
 // import.meta.env?.VITE_PONG_API_HOST || (IS_HTTPS ? loc.host : `${loc.hostname}:8000`);
export const API_HOST =
  import.meta.env?.VITE_PONG_API_HOST || loc.host;
  
const HTTP_PROTO = IS_HTTPS ? "https" : "http";
const WS_PROTO = IS_HTTPS ? "wss" : "ws";

export const httpUrl = (path) => `${HTTP_PROTO}://${API_HOST}${path}`;

export const lobbyWsUrl = (roomId, username) =>
  `${WS_PROTO}://${API_HOST}/api/pong/ws/lobby/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}`;

export const gameWsUrl = (roomId, username) =>
  `${WS_PROTO}://${API_HOST}/api/pong/ws/game/${encodeURIComponent(roomId)}?username=${encodeURIComponent(username)}`;

// ---------------------------------------------------------------------------
// Orbes de maná (blanco, azul, negro, rojo, verde).
//   base / hi / dark -> degradado esférico del orbe
//   glow             -> color del brillo (y acento de la interfaz)
// El orbe negro brilla en violeta: un brillo negro no se vería sobre fondo oscuro.
// ---------------------------------------------------------------------------
export const MANA_ORDER = ["white", "blue", "black", "red", "green"];

export const MANA = {
  white: { label: "Blanco", base: "#f3efdc", hi: "#ffffff", dark: "#c9c19d", glow: "#fff3b8" },
  blue:  { label: "Azul",   base: "#2a78d6", hi: "#9bd0ff", dark: "#103a80", glow: "#4aa3ff" },
  black: { label: "Negro",  base: "#3b2f4a", hi: "#9582b3", dark: "#130d1b", glow: "#a475ea" },
  red:   { label: "Rojo",   base: "#d6402b", hi: "#ffa283", dark: "#751106", glow: "#ff5a36" },
  green: { label: "Verde",  base: "#2f9d57", hi: "#94f2ab", dark: "#0d4526", glow: "#3be08a" },
};

// ---------------------------------------------------------------------------
// Tapetes de la mesa
//   felt / felt2 -> centro y borde del degradado de la superficie
//   rail         -> color del borde y del grosor de la mesa
//   line         -> color de las marcas (línea central, etc.)
// ---------------------------------------------------------------------------
export const TABLE_ORDER = ["felt_green", "felt_blue", "felt_red", "felt_black", "wood", "slate"];

export const TABLES = {
  felt_green: { label: "Fieltro verde", felt: "#23805a", felt2: "#165038", rail: "#5a3a1f", line: "#dcefd9" },
  felt_blue:  { label: "Fieltro azul",  felt: "#2a63aa", felt2: "#173b68", rail: "#3b2a1a", line: "#d6e6fb" },
  felt_red:   { label: "Fieltro rojo",  felt: "#9a2e3c", felt2: "#5e1823", rail: "#3a2418", line: "#f6dcdc" },
  felt_black: { label: "Fieltro negro", felt: "#2b2a36", felt2: "#15141c", rail: "#6a5a3a", line: "#cfc9e0" },
  wood:       { label: "Madera",        felt: "#a8743c", felt2: "#74491f", rail: "#3d2410", line: "#f3e2c2" },
  slate:      { label: "Pizarra",       felt: "#5b6772", felt2: "#38424b", rail: "#232a30", line: "#e3e8ec" },
};

// ---------------------------------------------------------------------------
// Palas (se usan en la pantalla de juego)
// ---------------------------------------------------------------------------
export const PADDLE_STYLE_ORDER = ["classic", "neon", "wood", "stone", "gold"];

export const PADDLE_STYLES = {
  classic: { label: "Clásica" },
  neon:    { label: "Neón" },
  wood:    { label: "Madera" },
  stone:   { label: "Piedra" },
  gold:    { label: "Oro" },
};

export const DEFAULT_PADDLE_COLORS = ["#f5c542", "#4cc9f0"];

// ---------------------------------------------------------------------------
// Configuración de partida
// ---------------------------------------------------------------------------
export const GOAL_LIMIT = { min: 1, max: 21 };
export const TIME_LIMIT = { min: 30, max: 900, step: 30 };
export const TIME_PRESETS = [60, 120, 180, 300];

export const DEFAULT_CONFIG = {
  mode: "online",
  win_mode: "goals",
  goal_limit: 5,
  time_limit: 120,
  ball_mana: "red",
  table_theme: "felt_green",
};

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function describeWin(config) {
  if (config.win_mode === "time") return `Contrarreloj de ${formatTime(config.time_limit)}`;
  const n = config.goal_limit;
  return `Primero a ${n} ${n === 1 ? "gol" : "goles"}`;
}

export function accentVars(mana) {
  const m = MANA[mana] || MANA.red;
  return { "--accent": m.glow, "--accent-ink": "#14101c" };
}