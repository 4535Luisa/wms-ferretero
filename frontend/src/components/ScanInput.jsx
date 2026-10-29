import { useEffect, useRef, useState } from "react";
import CamaraScanner from "./CamaraScanner";
import { limpiarEscaneo } from "./limpiarEscaneo";

// Bip de escaneo con Web Audio API, a volumen máximo.
// Los parlantes pequeños (Honeywell EDA52) suenan más fuerte entre 2 y 4 kHz;
// un tono grave casi no se oye en bodega, por eso ambos tonos van en ese rango.
// tipo "ok"    → 2 tonos ascendentes cortos (~0.2 s)
// tipo "error" → sirena de 4 pulsos agudo/grave (~0.9 s) + vibración larga
let audioCtx = null;

function contexto() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctx();
  // Android suspende el audio hasta que el usuario toca la pantalla.
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Desbloquea el audio con el primer toque o tecla, para que el primer bip
// del turno ya suene.
if (typeof window !== "undefined") {
  const desbloquear = () => contexto();
  window.addEventListener("pointerdown", desbloquear, { once: true });
  window.addEventListener("keydown", desbloquear, { once: true });
}

function tono(ctx, salida, frecuencia, inicio, duracion) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(frecuencia, inicio);
  // Volumen pleno de inicio a fin; las rampas de 5 ms solo evitan el "clic".
  gain.gain.setValueAtTime(0, inicio);
  gain.gain.linearRampToValueAtTime(1, inicio + 0.005);
  gain.gain.setValueAtTime(1, inicio + duracion - 0.005);
  gain.gain.linearRampToValueAtTime(0, inicio + duracion);
  osc.connect(gain);
  gain.connect(salida);
  osc.start(inicio);
  osc.stop(inicio + duracion);
}

function bip(tipo) {
  try {
    navigator.vibrate?.(tipo === "ok" ? 80 : [250, 100, 250, 100, 250]);
  } catch {
    // sin vibración
  }
  try {
    const ctx = contexto();
    if (!ctx) return;
    const salida = ctx.createGain();
    salida.gain.value = 1;
    salida.connect(ctx.destination);
    const t = ctx.currentTime + 0.01;
    if (tipo === "ok") {
      tono(ctx, salida, 2700, t, 0.09);
      tono(ctx, salida, 3500, t + 0.1, 0.11);
    } else {
      for (let i = 0; i < 4; i++) {
        tono(ctx, salida, i % 2 === 0 ? 3200 : 1600, t + i * 0.23, 0.2);
      }
    }
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
  placeholder = "Escanea o digita",
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
    setTimeout(() => setFlash(null), ok ? 400 : 1200);
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
      ? "rgba(0,255,135,0.28)"
      : flash === "error"
        ? "rgba(185,28,28,0.2)"
        : "#FFFFFF";

  return (
    <div
      ref={inputRef}
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "0.75rem",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            fontWeight: 700,
            lineHeight: 1.3,
            color: "#0A0A0A",
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
              padding: "8px 10px",
              fontSize: "13px",
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
              padding: "8px 10px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {camara ? "Texto" : "Cámara"}
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
            padding: "12px",
            border: `2px solid ${borderColor}`,
            borderRadius: "8px",
            fontSize: "17px",
            fontFamily: "DM Mono, monospace",
            fontWeight: 500,
            background: "#FFFFFF",
            outline: "none",
            transition: "border-color 0.15s, opacity 0.15s",
            opacity: disabled ? 0.6 : 1,
          }}
          autoFocus={autoFocus}
        />
      )}
      <p style={{ fontSize: "13px", lineHeight: 1.35, color: "#4B5160", marginTop: "8px" }}>
        {hint}
      </p>
    </div>
  );
}
