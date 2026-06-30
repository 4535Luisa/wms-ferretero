import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Escáner por cámara para celular/tablet. Abre la cámara trasera, decodifica en
// continuo (Code128/QR/EAN…) y entrega la primera lectura a onScan. La cámara
// solo funciona en HTTPS o localhost; en producción requiere camera=(self) en
// public/_headers (Permissions-Policy). La verificación contra lo que el perfil
// debe procesar la hace el backend; este componente solo captura.
export default function CamaraScanner({ onScan, onCerrar }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const yaLeyoRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const lector = new BrowserMultiFormatReader();
    let cancelado = false;

    lector
      // facingMode "environment": cámara trasera del celular/tablet.
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (resultado) => {
          // Una sola lectura por apertura: evita disparar onScan en ráfaga.
          if (resultado && !yaLeyoRef.current) {
            yaLeyoRef.current = true;
            onScan(resultado.getText());
          }
        },
      )
      .then((controls) => {
        if (cancelado) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((err) => {
        const nombre = err?.name || "";
        if (nombre === "NotAllowedError")
          setError("Permiso de cámara denegado. Habilítalo en el navegador.");
        else if (nombre === "NotFoundError")
          setError("No se encontró ninguna cámara en el dispositivo.");
        else setError("No se pudo abrir la cámara. Usa el modo texto.");
      });

    return () => {
      cancelado = true;
      if (controlsRef.current) controlsRef.current.stop();
    };
    // Solo al montar: el lector vive mientras la cámara esté abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        background: "#0A0A0A",
        borderRadius: "12px",
        padding: "12px",
        marginBottom: "1rem",
      }}
    >
      {error ? (
        <p
          style={{
            color: "#FCA5A5",
            fontSize: "13px",
            fontWeight: 500,
            textAlign: "center",
            padding: "1.5rem 1rem",
          }}
        >
          {error}
        </p>
      ) : (
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: "100%",
              maxHeight: "320px",
              objectFit: "cover",
              borderRadius: "8px",
              background: "#000",
            }}
          />
          {/* Guía visual de encuadre del código. */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "70%",
              height: "28%",
              border: "2px solid #00FF87",
              borderRadius: "8px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
              pointerEvents: "none",
            }}
          />
        </div>
      )}
      <button
        onClick={onCerrar}
        style={{
          width: "100%",
          marginTop: "10px",
          background: "transparent",
          color: "#FFFFFF",
          border: "1.5px solid rgba(255,255,255,0.3)",
          borderRadius: "8px",
          padding: "10px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "Outfit, sans-serif",
          minHeight: "44px",
        }}
      >
        ✕ Cerrar cámara
      </button>
    </div>
  );
}
