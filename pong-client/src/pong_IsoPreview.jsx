// pong_IsoPreview.jsx · Altar: mesa isométrica de muestra (CSS 3D) sobre un círculo ritual que
// se ilumina con el color del orbe elegido.
import { DEFAULT_PADDLE_COLORS, MANA, TABLES } from "./pong_config.js";
import ManaOrb from "./pong_ManaOrb.jsx";

export default function IsoPreview({ mana, table, children }) {
  const t = TABLES[table] || TABLES.felt_green;
  const m = MANA[mana] || MANA.red;

  return (
    <div className="stage-inner" style={{ "--glow": m.glow }}>
      <div className="altar" aria-hidden="true">
        <span className="altar-pool" />
        <span className="altar-ring altar-ring-outer" />
        <span className="altar-ring altar-ring-mid" />
        <span className="altar-ring altar-ring-inner" />

        <div className="iso-scene">
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
          {/* El orbe va en una capa 2D sobre el centro proyectado de la mesa */}
          <span className="iso-orb">
            <ManaOrb mana={mana} size={44} />
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
