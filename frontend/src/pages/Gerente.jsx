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

const estadoColor = {
  aprobado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  rechazado: { bg: "#FEE2E2", fg: "#991B1B" },
};

export default function Gerente() {
  const [ajustes, setAjustes] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [comentario, setComentario] = useState("");

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const { data } = await api.get("/api/ajustes");
      setAjustes(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const aprobar = async (id) => {
    setCargando(true);
    try {
      const { data } = await api.patch(`/api/ajustes/${id}/aprobar`);
      aviso(
        `✓ Ajuste aprobado — disponible: ${data.cantidad_disponible ?? "—"}`,
      );
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al aprobar", "error");
    } finally {
      setCargando(false);
    }
  };

  const rechazar = async (id) => {
    setCargando(true);
    try {
      await api.patch(`/api/ajustes/${id}/rechazar`, { comentario });
      aviso("Ajuste rechazado");
      setRechazandoId(null);
      setComentario("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al rechazar", "error");
    } finally {
      setCargando(false);
    }
  };

  const pendientes = ajustes.filter((a) => a.estado === "pendiente");
  const resueltos = ajustes.filter((a) => a.estado !== "pendiente");

  return (
    <Layout
      titulo="Gerente Logístico"
      subtitulo={`${pendientes.length} ajuste${pendientes.length !== 1 ? "s" : ""} por aprobar`}
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
        Ajustes por aprobar
      </h3>
      {pendientes.length === 0 ? (
        <div
          style={{
            ...C.card,
            textAlign: "center",
            color: "#888",
            marginBottom: "2rem",
          }}
        >
          No hay ajustes pendientes
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "2rem",
          }}
        >
          {pendientes.map((a) => (
            <div key={a.id} style={{ ...C.card, borderLeft: "4px solid #854D0E" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {a.productos?.descripcion_corta || "—"}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "12px",
                      color: "#888",
                      marginTop: "3px",
                    }}
                  >
                    {a.productos?.codigo_interno} · {a.bodegas?.codigo} · {a.tipo}{" "}
                    <strong
                      style={{
                        color: a.sentido === "incremento" ? "#007A40" : "#991B1B",
                      }}
                    >
                      {a.sentido === "incremento" ? "+" : "−"}
                      {a.cantidad}
                    </strong>
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                    {a.motivo}
                  </div>
                  {a.solicitante && (
                    <div style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}>
                      Solicitó: {a.solicitante}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button
                    onClick={() => aprobar(a.id)}
                    disabled={cargando}
                    style={{
                      background: "#00FF87",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Outfit, sans-serif",
                    }}
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() =>
                      setRechazandoId(rechazandoId === a.id ? null : a.id)
                    }
                    disabled={cargando}
                    style={{
                      background: "transparent",
                      color: "#991B1B",
                      border: "1.5px solid #FECACA",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "Outfit, sans-serif",
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              </div>

              {rechazandoId === a.id && (
                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                  <input
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Comentario (opcional)"
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      border: "1.5px solid #E8E8E8",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontFamily: "Outfit, sans-serif",
                    }}
                  />
                  <button
                    onClick={() => rechazar(a.id)}
                    disabled={cargando}
                    style={{
                      background: "#991B1B",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "8px",
                      padding: "9px 16px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Outfit, sans-serif",
                    }}
                  >
                    Confirmar rechazo
                  </button>
                </div>
              )}
            </div>
          ))}
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
        Resueltos recientes
      </h3>
      {resueltos.length === 0 ? (
        <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
          Sin ajustes resueltos
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {resueltos.slice(0, 30).map((a) => {
            const ec = estadoColor[a.estado] || estadoColor.aprobado;
            return (
              <div
                key={a.id}
                style={{
                  ...C.card,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {a.productos?.descripcion_corta || "—"}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "11px",
                      color: "#888",
                      marginTop: "2px",
                    }}
                  >
                    {a.productos?.codigo_interno} · {a.bodegas?.codigo} · {a.tipo}{" "}
                    {a.sentido === "incremento" ? "+" : "−"}
                    {a.cantidad}
                    {a.aprobador ? ` · ${a.aprobador}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background: ec.bg,
                    color: ec.fg,
                    borderRadius: "20px",
                    padding: "4px 10px",
                    flexShrink: 0,
                  }}
                >
                  {a.estado}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
