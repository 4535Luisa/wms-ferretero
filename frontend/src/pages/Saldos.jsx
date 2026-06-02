import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
  mono: { fontFamily: "DM Mono, monospace" },
};

const semaforoColor = {
  rojo: { bg: "#FEE2E2", fg: "#B91C1C", label: "URGENTE" },
  amarillo: { bg: "#FEF9C3", fg: "#854D0E", label: "PRONTO" },
  verde: { bg: "rgba(0,255,135,0.1)", fg: "#007A40", label: "NORMAL" },
};

export default function Saldos() {
  const [cola, setCola] = useState([]);
  const [entrantes, setEntrantes] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    try {
      const { data } = await api.get("/api/saldos");
      setCola(data.cola || []);
      setEntrantes(data.entrantes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const confirmarCaja = async (itemId) => {
    setCargando(true);
    try {
      await api.patch(`/api/saldos/caja/${itemId}/confirmar`);
      aviso("✓ Caja confirmada — inventario de SALDOS actualizado");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const entregar = async (id) => {
    setCargando(true);
    try {
      await api.patch(`/api/saldos/${id}/entregar`);
      aviso("✓ Saldo entregado al operario");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al entregar", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout
      titulo="Cola de Saldos"
      subtitulo={`${cola.length} solicitud${cola.length !== 1 ? "es" : ""} · ${entrantes.length} caja${entrantes.length !== 1 ? "s" : ""} por confirmar`}
    >
      {mensaje.texto && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1.25rem",
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

      {/* Cajas de reposición entrantes (railguard: inventario sube al confirmar) */}
      {entrantes.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#854D0E",
              marginBottom: "0.75rem",
            }}
          >
            📥 Cajas de reposición por confirmar
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {entrantes.map((e) => (
              <div
                key={e.id}
                style={{
                  ...C.card,
                  background: "#FFFBEB",
                  borderColor: "#FDE68A",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {e.descripcion}
                  </div>
                  <div style={{ ...C.mono, fontSize: "12px", color: "#888", marginTop: "3px" }}>
                    Ref: {e.referencia} · {e.cantidad_unidades} unidades
                  </div>
                </div>
                <button
                  onClick={() => confirmarCaja(e.id)}
                  disabled={cargando}
                  style={{
                    background: "#0A0A0A",
                    color: "#00FF87",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Confirmar recepción
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3
        style={{
          fontSize: "13px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#666",
          marginBottom: "0.75rem",
        }}
      >
        Solicitudes por operario
      </h3>

      {cola.length === 0 ? (
        <div style={{ ...C.card, padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📦</div>
          <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
            No hay solicitudes de saldos pendientes
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {cola.map((s) => {
            const sem = semaforoColor[s.semaforo] || semaforoColor.verde;
            return (
              <div
                key={s.id}
                style={{
                  ...C.card,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: `4px solid ${sem.fg}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>
                      {s.producto?.descripcion_corta || "—"}
                    </span>
                    <span
                      style={{
                        background: sem.bg,
                        color: sem.fg,
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {sem.label}
                    </span>
                  </div>
                  <div style={{ ...C.mono, fontSize: "12px", color: "#888", marginTop: "3px" }}>
                    Ref: {s.producto?.codigo_interno} · Operario:{" "}
                    {s.operario?.nombre || "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#0A0A0A",
                    }}
                  >
                    {s.cantidad_total}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>
                    unidades
                  </div>
                  <button
                    onClick={() => entregar(s.id)}
                    disabled={cargando}
                    style={{
                      background: "#00FF87",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: "8px",
                      padding: "9px 16px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Entregar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
