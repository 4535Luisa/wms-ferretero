import { useState, useEffect } from "react";
import ScanInput, { bip } from "./ScanInput";
import api from "../services/api";

// Pestaña "Ubicar mercancía recibida"
// Flujo: escanea ubicación → escanea cajas → sistema asigna ubicación al inventario
export default function MontacarguistaUbicar() {
  const [pendientes, setPendientes] = useState([]);
  const [ubicacionActiva, setUbicacionActiva] = useState(null); // { codigo, id }
  const [ultimaCaja, setUltimaCaja] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const cargarPendientes = async () => {
    try {
      const { data } = await api.get("/api/ubicaciones/pendientes-ubicar");
      setPendientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, []);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const onEscanear = async (escaneado) => {
    if (cargando) return;

    // Resolver si es ubicación o caja
    setCargando(true);
    try {
      const { data: resolucion } = await api.get(
        `/api/ubicaciones/resolver?escaneado=${escaneado}`,
      );

      if (resolucion.tipo === "ubicacion") {
        bip("ok");
        setUbicacionActiva(resolucion.datos);
        aviso(
          `📍 Ubicación ${resolucion.datos.codigo} activa — ahora escanea las cajas`,
        );
        return;
      }

      if (resolucion.tipo === "producto") {
        if (!ubicacionActiva) {
          bip("error");
          aviso(
            "⚠ Primero escanea la etiqueta de la ubicación destino",
            "error",
          );
          return;
        }

        // Ubicar la caja
        const { data } = await api.post("/api/ubicaciones/ubicar-caja", {
          ubicacion_escaneada: `UB-${ubicacionActiva.codigo}`,
          caja_escaneada: escaneado,
        });
        bip("ok");
        setUltimaCaja({
          ...resolucion.datos,
          ubicacion: ubicacionActiva.codigo,
        });
        aviso(data.mensaje);
        await cargarPendientes();
        return;
      }
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Código no reconocido", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {mensaje.texto && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "13px",
            fontWeight: 500,
            background:
              mensaje.tipo === "error" ? "#FEE2E2" : "rgba(0,255,135,0.1)",
            color: mensaje.tipo === "error" ? "#991B1B" : "#007A40",
            border: `1px solid ${mensaje.tipo === "error" ? "#FECACA" : "rgba(0,255,135,0.2)"}`,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Ubicación activa */}
      {ubicacionActiva ? (
        <div
          style={{
            background: "rgba(0,255,135,0.08)",
            border: "1.5px solid #00FF87",
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#007A40",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Ubicación activa
            </div>
            <div
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "20px",
                fontWeight: 700,
                color: "#0A0A0A",
              }}
            >
              {ubicacionActiva.codigo}
            </div>
          </div>
          <button
            onClick={() => setUbicacionActiva(null)}
            style={{
              background: "transparent",
              border: "1px solid #E8E8E8",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              cursor: "pointer",
              color: "#666",
            }}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "#FEF9C3",
            border: "1px solid #FDE68A",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "1rem",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#854D0E" }}>
            ⚠ Escanea primero la etiqueta de la ubicación destino
          </div>
          <div style={{ fontSize: "12px", color: "#92400E", marginTop: "4px" }}>
            Ejemplo: escanea la etiqueta UB-f1-3 de la estantería
          </div>
        </div>
      )}

      <ScanInput
        onScan={onEscanear}
        disabled={cargando}
        label={
          ubicacionActiva
            ? "Escanea cada caja a ubicar"
            : "Escanea la etiqueta de la ubicación"
        }
        hint="Primero la ubicación, luego las cajas — cada escaneo ubica 1 caja"
      />

      {/* Última caja ubicada */}
      {ultimaCaja && (
        <div
          style={{
            background: "rgba(0,255,135,0.06)",
            border: "1px solid rgba(0,255,135,0.2)",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "1rem",
          }}
        >
          <div style={{ fontSize: "11px", color: "#888" }}>
            Última caja ubicada
          </div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#007A40" }}>
            {ultimaCaja.descripcion_corta}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#888",
              fontFamily: "DM Mono, monospace",
            }}
          >
            Ref: {ultimaCaja.codigo_interno} → {ultimaCaja.ubicacion}
          </div>
        </div>
      )}

      {/* Pendientes de ubicar */}
      <div style={{ marginTop: "1rem" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "8px",
          }}
        >
          📦 Pendientes de ubicar ({pendientes.length})
        </div>
        {pendientes.length === 0 ? (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "2rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "14px", color: "#888" }}>
              ✓ Toda la mercancía está ubicada
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendientes.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E8",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {item.productos?.descripcion_corta}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#888",
                      fontFamily: "DM Mono, monospace",
                      marginTop: "2px",
                    }}
                  >
                    Ref: {item.productos?.codigo_interno} ·{" "}
                    {item.bodegas?.codigo}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "DM Mono, monospace",
                      fontWeight: 700,
                      fontSize: "16px",
                      color: "#0A0A0A",
                    }}
                  >
                    {item.cantidad_disponible}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    unidades
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
