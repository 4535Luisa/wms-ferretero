import { useEffect, useRef, useState } from "react";
import CamaraScanner from "./CamaraScanner";

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
//   permitirCamara         — muestra el botón 📷 Cámara
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
  const ref = useRef(null);

  useEffect(() => {
    if (!camara && autoFocus && ref.current) ref.current.focus();
  }, [autoFocus, camara]);

  // Ejecuta la acción al recibir Enter — sin esperar confirmación manual.
  const enviar = () => {
    const v = valor.trim();
    if (!v || disabled) return;
    setValor("");
    if (ref.current) ref.current.focus();
    onScan(v, "teclado");
  };

  // Lectura por cámara: ejecuta inmediatamente al detectar el código.
  const onCamara = (texto) => {
    setCamara(false);
    const v = (texto || "").trim();
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
    flash === "ok" ? "#00FF87" : flash === "error" ? "#FF4444" : "#E8E8E8";

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
        border: `1.5px solid ${borderColor}`,
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
            color: "#888",
            margin: 0,
          }}
        >
          {label}
        </p>
        {permitirCamara && (
          <button
            onClick={() => setCamara((v) => !v)}
            disabled={disabled}
            style={{
              flexShrink: 0,
              background: camara ? "#0A0A0A" : "transparent",
              color: camara ? "#00FF87" : "#0A0A0A",
              border: "1.5px solid #E8E8E8",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {camara ? "⌨️ Texto" : "📷 Cámara"}
          </button>
        )}
      </div>

      {camara ? (
        <CamaraScanner onScan={onCamara} onCerrar={() => setCamara(false)} />
      ) : (
        <input
          ref={ref}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder={placeholder}
          disabled={disabled}
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
            transition: "border-color 0.15s",
          }}
          autoFocus={autoFocus}
        />
      )}
      <p style={{ fontSize: "12px", color: "#BBB", marginTop: "8px" }}>
        {hint}
      </p>
    </div>
  );
}
