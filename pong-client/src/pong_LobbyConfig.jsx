// pong_LobbyConfig.jsx · Configuración de la partida (solo la edita el anfitrión).
import { useCallback } from "react";
import {
  GOAL_LIMIT,
  MANA,
  MANA_ORDER,
  TABLES,
  TABLE_ORDER,
  TIME_LIMIT,
  TIME_PRESETS,
  formatTime,
} from "./pong_config.js";
import ManaOrb from "./pong_ManaOrb.jsx";
import { RadioGroup, useSyncedValue } from "./pong_ui.jsx";

const WIN_OPTIONS = [
  { value: "goals", label: "Límite de goles", hint: "Gana el primero en llegar" },
  { value: "time", label: "Contrarreloj", hint: "Gana quien lidere al acabar" },
];

const MANA_OPTIONS = MANA_ORDER.map((id) => ({ value: id, label: MANA[id].label }));
const TABLE_OPTIONS = TABLE_ORDER.map((id) => ({ value: id, label: TABLES[id].label }));

export default function LobbyConfig({ config, isHost, send }) {
  const disabled = !isHost;

  const sendConfig = useCallback((partial) => send({ action: "UPDATE_CONFIG", ...partial }), [send]);
  const commitGoals = useCallback((v) => sendConfig({ goal_limit: v }), [sendConfig]);
  const commitTime = useCallback((v) => sendConfig({ time_limit: v }), [sendConfig]);

  const [goals, setGoals] = useSyncedValue(config.goal_limit, commitGoals);
  const [time, setTime] = useSyncedValue(config.time_limit, commitTime);

  return (
    <section className="block" aria-labelledby="cfg-title">
      <h2 id="cfg-title" className="block-title">Partida</h2>
      {disabled && <p className="note">Solo el anfitrión puede cambiar la configuración.</p>}

      <RadioGroup
        name="win_mode"
        legend="Cómo se gana"
        value={config.win_mode}
        onChange={(v) => sendConfig({ win_mode: v })}
        options={WIN_OPTIONS}
        disabled={disabled}
        variant="seg"
        renderOption={(o) => (
          <>
            <span className="seg-label">{o.label}</span>
            <span className="seg-hint">{o.hint}</span>
          </>
        )}
      />

      {config.win_mode === "goals" ? (
        <div className="field">
          <label className="field-label" htmlFor="goal-range">Goles para ganar</label>
          <div className="range-row">
            <div className="lever" style={{ "--fill": `${((goals - GOAL_LIMIT.min) / (GOAL_LIMIT.max - GOAL_LIMIT.min)) * 100}%`, "--steps": (GOAL_LIMIT.max - GOAL_LIMIT.min) / 1 }}>
            <input
              id="goal-range"
              type="range"
              min={GOAL_LIMIT.min}
              max={GOAL_LIMIT.max}
              step={1}
              value={goals}
              disabled={disabled}
              onChange={(e) => setGoals(Number(e.target.value))}
            />
            <span className="lever-ticks" aria-hidden="true" />
            </div>
            <output className="range-value" htmlFor="goal-range">{goals}</output>
          </div>
        </div>
      ) : (
        <div className="field">
          <label className="field-label" htmlFor="time-range">Duración</label>
          <div className="range-row">
            <div className="lever" style={{ "--fill": `${((time - TIME_LIMIT.min) / (TIME_LIMIT.max - TIME_LIMIT.min)) * 100}%`, "--steps": (TIME_LIMIT.max - TIME_LIMIT.min) / TIME_LIMIT.step }}>
            <input
              id="time-range"
              type="range"
              min={TIME_LIMIT.min}
              max={TIME_LIMIT.max}
              step={TIME_LIMIT.step}
              value={time}
              disabled={disabled}
              onChange={(e) => setTime(Number(e.target.value))}
            />
            <span className="lever-ticks" aria-hidden="true" />
            </div>
            <output className="range-value" htmlFor="time-range">{formatTime(time)}</output>
          </div>
          <div className="chips">
            {TIME_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                aria-pressed={time === s}
                disabled={disabled}
                onClick={() => setTime(s)}
              >
                {s / 60} min
              </button>
            ))}
          </div>
          <p className="note">Si hay empate al acabar el tiempo, el siguiente gol gana.</p>
        </div>
      )}

      <RadioGroup
        name="ball_mana"
        legend="Orbe de maná"
        value={config.ball_mana}
        onChange={(v) => sendConfig({ ball_mana: v })}
        options={MANA_OPTIONS}
        disabled={disabled}
        variant="orb"
        renderOption={(o) => (
          <>
            <ManaOrb mana={o.value} size={40} />
            <span className="pick-name">{o.label}</span>
          </>
        )}
      />

      <RadioGroup
        name="table_theme"
        legend="Tapete de la mesa"
        value={config.table_theme}
        onChange={(v) => sendConfig({ table_theme: v })}
        options={TABLE_OPTIONS}
        disabled={disabled}
        variant="swatch"
        renderOption={(o) => (
          <>
            <span
              className="swatch"
              style={{
                background: `radial-gradient(circle at 50% 40%, ${TABLES[o.value].felt}, ${TABLES[o.value].felt2})`,
                borderColor: TABLES[o.value].rail,
              }}
            />
            <span className="pick-name">{o.label}</span>
          </>
        )}
      />
    </section>
  );
}
