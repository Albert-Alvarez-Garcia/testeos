// pong_IsoPreview.jsx · Mesa isométrica de muestra hecha con transformaciones CSS 3D.
// La proyección es la misma idea que usará el canvas del juego: plano 2D girado 45° e inclinado.
import { DEFAULT_PADDLE_COLORS, MANA, TABLES } from "./pong_config.js";
import ManaOrb from "./pong_ManaOrb.jsx";

export default function IsoPreview({ mana, table, children }) {
  const t = TABLES[table] || TABLES.felt_green;
  const m = MANA[mana] || MANA.red;

  return (
    <div className="stage-inner" style={{ "--glow": m.glow }}>
      <div className="iso-scene" aria-hidden="true">
        <div
          className="iso-table"
          style={{ "--felt": t.felt, "--felt2": t.felt2, "--rail": t.rail, "--line": t.line }}
        >
          <div className="iso-surface">
            <span className="iso-midline" />
            <span className="iso-paddle iso-paddle-left" style={{ color: DEFAULT_PADDLE_COLORS[0] }} />
            <span className="iso-paddle iso-paddle-right" style={{ color: DEFAULT_PADDLE_COLORS[1] }} />
            <span className="iso-ball-light" />
            <span className="iso-ball-shadow" />
          </div>
        </div>
        {/* El orbe va en una capa 2D sobre el centro proyectado de la mesa: así su brillo no
            queda cortado por el plano de la mesa y no depende del orden de profundidad 3D. */}
        <span className="iso-orb">
          <ManaOrb mana={mana} size={40} />
        </span>
      </div>
      {children}
    </div>
  );
}
