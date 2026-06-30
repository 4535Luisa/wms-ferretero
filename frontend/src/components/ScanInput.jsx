import { useEffect, useRef, useState } from "react";
import CamaraScanner from "./CamaraScanner";

// Input de escaneo reutilizable (pistola o cámara). Se auto-enfoca, acepta la
// lectura + Enter y entrega el valor a onScan. Con permitirCamara muestra un
// botón para escanear con la cámara del celular/tablet (@zxing). La verificación
// contra lo que el perfil debe procesar la hace el backend; este componente solo
// captura.
export default function ScanInput({
  onScan,
  disabled = false,
  label = "Escanea o digita la referencia",
  placeholder = "Referencia — ej: 120212",
  hint = "Presiona Enter después de escanear",
  autoFocus = true,
  permitirCamara = true,
}) {
  const [valor, setValor] = useState("");
  const [camara, setCamara] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!camara && autoFocus && ref.current) ref.current.focus();
  }, [autoFocus, camara]);

  const enviar = () => {
    const v = valor.trim();
    if (!v || disabled) return;
    // origen "teclado": pistola lectora o digitación manual (caja sin etiqueta).
    onScan(v, "teclado");
    setValor("");
    if (ref.current) ref.current.focus();
  };

  // Lectura por cámara: entrega el valor y cierra la cámara para que el flujo
  // (p. ej. confirmar cantidad) continúe sin disparos repetidos.
  const onCamara = (texto) => {
    setCamara(false);
    const v = (texto || "").trim();
    if (v && !disabled) onScan(v, "camara");
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E8E8",
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1rem",
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
        <div style={{ display: "flex", gap: "8px" }}>
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
              flex: 1,
              padding: "10px 14px",
              border: "1px solid #E8E8E8",
              borderRadius: "8px",
              fontSize: "18px",
              fontFamily: "DM Mono, monospace",
              fontWeight: 500,
            }}
            autoFocus={autoFocus}
          />
          <button
            onClick={enviar}
            disabled={disabled}
            style={{
              flexShrink: 0,
              background: "#00FF87",
              color: "#0A0A0A",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            Verificar
          </button>
        </div>
      )}
      <p style={{ fontSize: "12px", color: "#BBB", marginTop: "8px" }}>{hint}</p>
    </div>
  );
}
