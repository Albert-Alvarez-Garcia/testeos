// pong_ManaOrb.jsx · Orbe de maná: usa la imagen del orbe y, si no carga, la esfera de degradado.
import { useEffect, useState } from "react";
import { MANA } from "./pong_config.js";
import { probeOrb } from "./pong_orbs.js";

export default function ManaOrb({ mana, size = 40, glow = true, className = "", style }) {
  const m = MANA[mana] || MANA.red;
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    probeOrb(mana).then((img) => {
      if (alive && img) setSrc(img.src);
    });
    return () => {
      alive = false;
    };
  }, [mana]);

  const vars = { "--glow": m.glow, width: size, height: size, ...style };

  if (src) {
    return (
      <img
        className={`orb-img ${glow ? "orb-img-glow" : ""} ${className}`}
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
        style={vars}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`orb ${glow ? "orb-glow" : ""} ${className}`}
      style={{ "--orb": m.base, "--orb-hi": m.hi, "--orb-lo": m.dark, ...vars }}
      aria-hidden="true"
    />
  );
}
