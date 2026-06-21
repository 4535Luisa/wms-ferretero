import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
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

export default function Verificacion() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargarLista = async () => {
    try {
      const { data } = await api.get("/api/verificacion");
      setPedidos(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarLista();
  }, []);

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`/api/verificacion/${id}`);
      setActivo(data);
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  // El escaneo cruza la referencia leída contra los ítems pendientes del pedido.
  // El backend re-verifica antes de marcar verificado (no se puede saltar).
  const onEscanear = async (refEscaneada) => {
    if (!activo) return;
    const norm = refEscaneada.trim().toUpperCase();
    const objetivo = (activo.pedido_items || []).find(
      (it) =>
        !it.verificado &&
        (it.productos?.codigo_interno || "").trim().toUpperCase() === norm,
    );
    if (!objetivo) {
      const yaVerificado = (activo.pedido_items || []).some(
        (it) =>
          it.verificado &&
          (it.productos?.codigo_interno || "").trim().toUpperCase() === norm,
      );
      aviso(
        yaVerificado
          ? `La referencia ${norm} ya fue verificada`
          : `La referencia ${norm} no pertenece a este pedido`,
        "error",
      );
      return;
    }

    setCargando(true);
    try {
      const { data } = await api.patch(
        `/api/verificacion/${activo.id}/items/${objetivo.id}/verificar`,
        { referencia_escaneada: refEscaneada },
      );
      setActivo((p) => ({
        ...p,
        pedido_items: p.pedido_items.map((it) =>
          it.id === objetivo.id ? { ...it, verificado: true } : it,
        ),
      }));
      aviso(`✓ Verificada (${data.verificados}/${data.total})`);
    } catch (err) {
      aviso(err.response?.data?.error || "Error al verificar", "error");
    } finally {
      setCargando(false);
    }
  };

  const confirmar = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.patch(`/api/verificacion/${activo.id}/confirmar`);
      aviso("✓ Pedido verificado y enviado a facturación");
      setVista("lista");
      setActivo(null);
      await cargarLista();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const items = activo?.pedido_items || [];
  const verificados = items.filter((i) => i.verificado).length;
  const todosVerificados = items.length > 0 && verificados === items.length;

  return (
    <Layout
      titulo="Verificación"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} por verificar`
          : `Pedido ${activo?.numero} · ${verificados}/${items.length} verificadas`
      }
    >
      {vista === "detalle" && (
        <button
          onClick={() => {
            setVista("lista");
            setActivo(null);
            cargarLista();
          }}
          style={{
            background: "transparent",
            color: "#0A0A0A",
            border: "1.5px solid #E8E8E8",
            borderRadius: "8px",
            padding: "9px 18px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Outfit, sans-serif",
            marginBottom: "1.25rem",
          }}
        >
          ← Volver
        </button>
      )}

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

      {vista === "lista" &&
        (pedidos.length === 0 ? (
          <div style={{ ...C.card, padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "44px", marginBottom: "1rem" }}>✅</div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
              No hay pedidos por verificar
            </p>
            <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
              Cuando un operario cierre un pedido aparecerá aquí
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pedidos.map((p) => (
              <div
                key={p.id}
                onClick={() => abrir(p.id)}
                style={{
                  ...C.card,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#00FF87";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(0,255,135,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#E8E8E8";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div>
                  <span style={{ ...C.mono, fontSize: "14px", fontWeight: 700 }}>
                    {p.numero}
                  </span>
                  <div
                    style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}
                  >
                    {p.pedido_items?.length || 0} referencias
                    {p.hora_cierre && (
                      <span style={{ marginLeft: "8px" }}>
                        · Cerrado:{" "}
                        {new Date(p.hora_cierre).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  style={{ fontSize: "13px", color: "#00CC6A", fontWeight: 600 }}
                >
                  Verificar →
                </span>
              </div>
            ))}
          </div>
        ))}

      {vista === "detalle" && activo && (
        <div style={{ maxWidth: "720px" }}>
          <ScanInput
            onScan={onEscanear}
            disabled={cargando || todosVerificados}
            label="Escanea cada caja para verificar la referencia"
            hint="Cada referencia se confirma contra el pedido cerrado"
          />

          <div style={{ ...C.card, marginTop: "1rem", padding: "0.5rem 1rem" }}>
            {items.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  padding: "0.875rem 0.5rem",
                  borderBottom:
                    idx < items.length - 1 ? "1px solid #F5F5F5" : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  background: item.verificado
                    ? "rgba(0,255,135,0.05)"
                    : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {item.productos?.descripcion_corta || item.descripcion}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "11px",
                      color: "#888",
                      marginTop: "2px",
                    }}
                  >
                    {item.productos?.codigo_interno} ·{" "}
                    {item.cantidad_picking ?? item.cantidad_pedida} und
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: item.verificado ? "#007A40" : "#999",
                    flexShrink: 0,
                  }}
                >
                  {item.verificado ? "✓ Verificada" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={confirmar}
            disabled={cargando || !todosVerificados}
            style={{
              width: "100%",
              marginTop: "1rem",
              background: todosVerificados ? "#00FF87" : "#E8E8E8",
              color: todosVerificados ? "#0A0A0A" : "#999",
              border: "none",
              borderRadius: "10px",
              padding: "14px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: cargando || !todosVerificados ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {todosVerificados
              ? "✓ Confirmar verificación — enviar a facturación"
              : `Faltan ${items.length - verificados} referencia(s) por escanear`}
          </button>
        </div>
      )}
    </Layout>
  );
}
