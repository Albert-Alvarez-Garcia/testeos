// pong_ManaOrb.jsx · Orbe de maná (esfera con degradado + brillo).
import { MANA } from "./pong_config.js";

export default function ManaOrb({ mana, size = 40, glow = true, className = "", style }) {
  const m = MANA[mana] || MANA.red;
  return (
    <span
      className={`orb ${glow ? "orb-glow" : ""} ${className}`}
      style={{
        "--orb": m.base,
        "--orb-hi": m.hi,
        "--orb-lo": m.dark,
        "--glow": m.glow,
        width: size,
        height: size,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
