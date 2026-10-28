import { useEffect, useRef, useState } from "react";
import CamaraScanner from "./CamaraScanner";
import { limpiarEscaneo } from "./limpiarEscaneo";

// Genera un bip usando Web Audio API.
// tipo "ok"    → 880Hz, 80ms  (agudo, corto) — confirmación exitosa
// tipo "error" → 220Hz, 400ms (grave, largo) — referencia incorrecta
function bip(tipo) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    if (tipo === "ok") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio no disponible — silencio
  }
}

// Input de escaneo reutilizable para pistola lectora, sensor del dispositivo
// o cámara (@zxing). Al recibir Enter ejecuta la acción inmediatamente sin
// botón de confirmación. La verificación la hace el backend; este componente
// solo captura y notifica el resultado via onScan.
//
// Props:
//   onScan(valor, origen)  — se llama al recibir Enter o al leer con cámara
//   onResultado(ok)        — opcional: el padre llama bipOk/bipError pasando true/false
//                           O puede llamar bip directamente importando la función
//   disabled               — bloquea el input
//   label / placeholder    — textos de UI
//   permitirCamara         — muestra el botón  Cámara
export { bip };


export default function ScanInput({
  onScan,
  disabled = false,
  label = "Escanea la referencia",
  placeholder = "Escanea o digita — Enter para confirmar",
  hint = "El sensor enviará Enter automáticamente al leer el código",
  autoFocus = true,
  permitirCamara = true,
}) {
  const [valor, setValor] = useState("");
  const [camara, setCamara] = useState(false);
  const [flash, setFlash] = useState(null); // "ok" | "error" | null
  // Teclado de pantalla: oculto por defecto para escanear seguido con el
  // lector integrado (EDA52) sin que aparezca en cada lectura. El dispositivo
  // recuerda la elección. No afecta a teclados físicos.
  const [teclado, setTeclado] = useState(() => {
    try {
      return localStorage.getItem("scan_teclado") === "1";
    } catch {
      return false;
    }
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!camara && autoFocus && ref.current) ref.current.focus();
  }, [autoFocus, camara]);

  // Al terminar de procesar una lectura (disabled vuelve a false) el campo
  // recupera el cursor solo, salvo que el usuario esté en otro campo de texto.
  useEffect(() => {
    if (disabled || camara || !ref.current) return;
    const activo = document.activeElement;
    const enOtroCampo =
      activo &&
      activo !== ref.current &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName) || activo.isContentEditable);
    if (!enOtroCampo) ref.current.focus();
  }, [disabled, camara]);

  const cambiarTeclado = () => {
    const nuevo = !teclado;
    setTeclado(nuevo);
    try {
      localStorage.setItem("scan_teclado", nuevo ? "1" : "0");
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
    // Volver a enfocar para que el teclado aparezca o se oculte de inmediato.
    if (ref.current) {
      ref.current.blur();
      setTimeout(() => ref.current?.focus(), 50);
    }
  };

  // Ejecuta la acción al recibir Enter — sin esperar confirmación manual.
  // `texto` es lo que hay escrito en el campo al recibir el Enter. Los lectores
  // integrados (Honeywell EDA52) teclean muy rápido: el estado `valor` puede ir
  // atrasado y perder los últimos dígitos, así que se lee el campo directamente.
  const enviar = (texto = valor) => {
    // Ej.: el Honeywell agrega el AI (01) al leer EAN14:
    // "0117708935847713" -> "17708935847713"
    const v = limpiarEscaneo(texto);
    if (!v || disabled) return;
    setValor("");
    onScan(v, "teclado");
    // Recuperar foco automaticamente para escaneo continuo
    setTimeout(() => {
      if (ref.current) ref.current.focus();
    }, 50);
  };

  // Lectura por cámara: ejecuta inmediatamente al detectar el código.
  const onCamara = (texto) => {
    setCamara(false);
    const v = limpiarEscaneo(texto);
    if (v && !disabled) onScan(v, "camara");
  };

  // Permite que el componente padre muestre feedback visual + sonido
  // llamando scanInputRef.current.resultado(ok).
  // Alternativa: el padre puede importar { bip } y llamarlo directamente.
  const resultado = (ok) => {
    bip(ok ? "ok" : "error");
    setFlash(ok ? "ok" : "error");
    setTimeout(() => setFlash(null), ok ? 300 : 600);
  };

  // Exponer resultado() vía ref para que el padre pueda llamarlo.
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.resultado = resultado;
  });

  const borderColor =
    flash === "ok" ? "#00FF87" : flash === "error" ? "#B91C1C" : "#E2E4E8";

  const bgColor =
    flash === "ok"
      ? "rgba(0,255,135,0.04)"
      : flash === "error"
        ? "rgba(255,68,68,0.04)"
        : "#FFFFFF";

  return (
    <div
      ref={inputRef}
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1rem",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#4B5160",
            margin: 0,
          }}
        >
          {label}
        </p>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {!camara && (
          <button
            type="button"
            onClick={cambiarTeclado}
            aria-pressed={teclado}
            style={{
              background: teclado ? "#0A0A0A" : "transparent",
              color: teclado ? "#00FF87" : "#0A0A0A",
              border: "1px solid #E2E4E8",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {teclado ? "Ocultar teclado" : "Teclado"}
          </button>
        )}
        {permitirCamara && (
          <button
            type="button"
            onClick={() => setCamara((v) => !v)}
            disabled={disabled}
            style={{
              flexShrink: 0,
              background: camara ? "#0A0A0A" : "transparent",
              color: camara ? "#00FF87" : "#0A0A0A",
              border: "1px solid #E2E4E8",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {camara ? "⌨️ Texto" : " Cámara"}
          </button>
        )}
        </div>
      </div>

      {camara ? (
        <CamaraScanner onScan={onCamara} onCerrar={() => setCamara(false)} />
      ) : (
        <input
          ref={ref}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            // Algunos lectores Android envían el Enter solo con keyCode 13.
            if (e.key === "Enter" || e.keyCode === 13) {
              e.preventDefault();
              enviar(e.currentTarget.value);
            }
          }}
          onBlur={() => {
            // Recuperar foco para escaneo continuo con pistola, salvo que el
            // usuario haya pasado a otro campo de texto (motivo, cantidad…).
            setTimeout(() => {
              const activo = document.activeElement;
              const escribiendo =
                activo &&
                activo !== ref.current &&
                (["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName) ||
                  activo.isContentEditable);
              if (ref.current && !disabled && !escribiendo) ref.current.focus();
            }, 100);
          }}
          placeholder={placeholder}
          // readOnly (no disabled) mientras se procesa: un campo desactivado
          // pierde el cursor y había que tocarlo después de cada caja.
          readOnly={disabled}
          aria-disabled={disabled}
          inputMode={teclado ? "text" : "none"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            border: `1px solid ${borderColor}`,
            borderRadius: "8px",
            fontSize: "18px",
            fontFamily: "DM Mono, monospace",
            fontWeight: 500,
            background: "transparent",
            outline: "none",
            transition: "border-color 0.15s, opacity 0.15s",
            opacity: disabled ? 0.6 : 1,
          }}
          autoFocus={autoFocus}
        />
      )}
      <p style={{ fontSize: "12px", color: "#8A909C", marginTop: "8px" }}>
        {hint}
      </p>
    </div>
  );
}
