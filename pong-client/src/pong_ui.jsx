// pong_ui.jsx · Piezas de interfaz reutilizables.
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Grupo de opciones exclusivas. Usa <input type="radio"> reales (ocultos visualmente),
 * así el teclado (flechas, tabulador) y los lectores de pantalla funcionan sin código extra.
 *
 * variant: "seg" (segmentado) | "orb" (orbes de maná) | "swatch" (tapetes)
 */
export function RadioGroup({ name, legend, value, onChange, options, disabled = false, variant = "seg", renderOption }) {
  return (
    <fieldset className={`radio-group radio-${variant}`} disabled={disabled}>
      <legend className="field-label">{legend}</legend>
      <div className="radio-row">
        {options.map((opt) => (
          <label key={opt.value} className="radio">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span className="radio-face">{renderOption(opt)}</span>
          </label>
        ))}
        {/* Pieza de latón de la palanca (solo visual): se desliza hasta la opción elegida */}
        {variant === "seg" && <span className="radio-slug" aria-hidden="true" />}
      </div>
    </fieldset>
  );
}

/**
 * Valor que se edita en local (para que el control responda al instante) y se envía al
 * servidor con retardo. Si el servidor cambia el valor por otra vía (otro host, reconexión),
 * el control se sincroniza; el eco de lo que acabamos de enviar se ignora para que el
 * deslizador no "salte" mientras se arrastra.
 */
export function useSyncedValue(serverValue, commit, delay = 250) {
  const [draft, setDraft] = useState(serverValue);
  const lastSent = useRef(serverValue);
  const timer = useRef(null);

  useEffect(() => {
    if (serverValue !== lastSent.current) {
      lastSent.current = serverValue;
      setDraft(serverValue);
    }
  }, [serverValue]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const change = useCallback(
    (next) => {
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        lastSent.current = next;
        commit(next);
      }, delay);
    },
    [commit, delay]
  );

  return [draft, change];
}
