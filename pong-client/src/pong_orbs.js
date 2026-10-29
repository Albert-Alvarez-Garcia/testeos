// pong_orbs.js · Imágenes de los orbes de maná (monedas con el símbolo de cada color).
// Se buscan en varias carpetas habituales, en este orden; si ninguna responde, la interfaz y el
// canvas siguen dibujando el orbe de degradado de siempre (no se rompe nada).
const BASE = import.meta.env?.BASE_URL ?? "/";
const FOLDERS = ["/public/assets/", `${BASE}assets/`, "/assets/"];

const FILES = {
  white: "blanco-removebg-preview.png",
  blue: "azul-removebg-preview.png",
  black: "negro-removebg-preview.png",
  red: "rojo-removebg-preview.png",
  green: "verde-removebg-preview.png",
};

const cache = new Map();

/** Devuelve una promesa con el <img> ya cargado del orbe (o null si no se encuentra). */
export function probeOrb(mana) {
  if (cache.has(mana)) return cache.get(mana);
  const file = FILES[mana];
  const urls = file ? [...new Set(FOLDERS.map((f) => f + file))] : [];

  const promise = new Promise((resolve) => {
    const tryNext = (i) => {
      if (i >= urls.length) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => tryNext(i + 1);
      img.src = urls[i];
    };
    tryNext(0);
  });
  cache.set(mana, promise);
  return promise;
}
