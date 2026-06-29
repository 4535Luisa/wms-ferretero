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
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "Outfit, sans-serif",
    boxSizing: "border-box",
  },
};

export default function Despacho() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  // Formulario de despacho.
  const [bultos, setBultos] = useState("");
  const [peso, setPeso] = useState("");
  const [obs, setObs] = useState("");
  const [pendientes, setPendientes] = useState({}); // item_id -> motivo

  // Datos del transportista (opcionales).
  const [transportadora, setTransportadora] = useState("");
  const [guia, setGuia] = useState("");
  const [conductor, setConductor] = useState("");
  const [placa, setPlaca] = useState("");

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargarLista = async () => {
    try {
      const { data } = await api.get("/api/despacho");
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
      const { data } = await api.get(`/api/despacho/${id}`);
      setActivo(data);
      setBultos("");
      setPeso("");
      setObs("");
      setPendientes({});
      setTransportadora("");
      setGuia("");
      setConductor("");
      setPlaca("");
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  const volver = () => {
    setVista("lista");
    setActivo(null);
    cargarLista();
  };

  // Alterna si una referencia queda pendiente en el despacho parcial.
  const togglePendiente = (itemId) => {
    setPendientes((prev) => {
      const next = { ...prev };
      if (itemId in next) delete next[itemId];
      else next[itemId] = "";
      return next;
    });
  };

  const confirmar = async () => {
    if (!activo) return;
    const items_pendientes = Object.entries(pendientes).map(
      ([item_id, motivo]) => ({ item_id, motivo }),
    );
    if (items_pendientes.some((p) => !p.motivo.trim())) {
      aviso("Cada referencia pendiente requiere un motivo", "error");
      return;
    }
    setCargando(true);
    try {
      const { data } = await api.patch(`/api/despacho/${activo.id}`, {
        bultos,
        peso_kg: peso,
        observaciones: obs,
        items_pendientes,
        transportadora,
        guia_transporte: guia,
        conductor,
        placa_vehiculo: placa,
      });
      aviso(data.mensaje || "Pedido despachado");
      volver();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al despachar", "error");
    } finally {
      setCargando(false);
    }
  };

  const items = activo?.pedido_items || [];

  return (
    <Layout
      titulo="Despacho"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} por despachar`
          : `Pedido ${activo?.numero}`
      }
    >
      {vista === "detalle" && (
        <button
          onClick={volver}
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
            <div style={{ fontSize: "44px", marginBottom: "1rem" }}>🚚</div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
              No hay pedidos por despachar
            </p>
            <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
              Cuando un pedido se verifique aparecerá aquí
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
                    {p.hora_verificacion && (
                      <span style={{ marginLeft: "8px" }}>
                        · Verificado:{" "}
                        {new Date(p.hora_verificacion).toLocaleString("es-CO", {
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
                  Despachar →
                </span>
              </div>
            ))}
          </div>
        ))}

      {vista === "detalle" && activo && (
        <div style={{ maxWidth: "720px" }}>
          <div style={{ ...C.card, marginBottom: "1rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#555",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Bultos *
                </label>
                <input
                  type="number"
                  min="1"
                  value={bultos}
                  onChange={(e) => setBultos(e.target.value)}
                  placeholder="Ej: 3"
                  style={C.input}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#555",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Peso (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="Opcional"
                  style={C.input}
                />
              </div>
            </div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#555",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Observaciones
            </label>
            <input
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Opcional"
              style={C.input}
            />

            <div
              style={{
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid #F0F0F0",
              }}
            >
              <h4
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#666",
                  margin: "0 0 12px 0",
                }}
              >
                🚛 Datos del transportista (opcional)
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#555",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Transportadora
                  </label>
                  <input
                    type="text"
                    value={transportadora}
                    onChange={(e) => setTransportadora(e.target.value)}
                    placeholder="Ej: Servientrega"
                    style={C.input}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#555",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    N° guía / remesa / factura
                  </label>
                  <input
                    type="text"
                    value={guia}
                    onChange={(e) => setGuia(e.target.value)}
                    placeholder="Ej: 123456789"
                    style={C.input}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#555",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Conductor
                  </label>
                  <input
                    type="text"
                    value={conductor}
                    onChange={(e) => setConductor(e.target.value)}
                    placeholder="Nombre del conductor"
                    style={C.input}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#555",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Placa del vehículo
                  </label>
                  <input
                    type="text"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value)}
                    placeholder="Ej: ABC123"
                    style={C.input}
                  />
                </div>
              </div>
            </div>
          </div>

          <h3
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#666",
              marginBottom: "0.5rem",
            }}
          >
            Referencias — marca las que queden pendientes
          </h3>
          <div style={{ ...C.card, padding: "0.5rem 1rem", marginBottom: "1rem" }}>
            {items.map((item, idx) => {
              const esPendiente = item.id in pendientes;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "0.75rem 0.5rem",
                    borderBottom:
                      idx < items.length - 1 ? "1px solid #F5F5F5" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
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
                    <button
                      onClick={() => togglePendiente(item.id)}
                      style={{
                        flexShrink: 0,
                        background: esPendiente ? "#FEE2E2" : "transparent",
                        color: esPendiente ? "#991B1B" : "#888",
                        border: `1.5px solid ${esPendiente ? "#FECACA" : "#E8E8E8"}`,
                        borderRadius: "8px",
                        padding: "7px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Outfit, sans-serif",
                      }}
                    >
                      {esPendiente ? "✗ Pendiente" : "Marcar pendiente"}
                    </button>
                  </div>
                  {esPendiente && (
                    <input
                      type="text"
                      value={pendientes[item.id]}
                      onChange={(e) =>
                        setPendientes((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="Motivo del pendiente (obligatorio)"
                      style={{ ...C.input, marginTop: "8px" }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={confirmar}
            disabled={cargando}
            style={{
              width: "100%",
              background: "#00FF87",
              color: "#0A0A0A",
              border: "none",
              borderRadius: "10px",
              padding: "14px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: cargando ? "not-allowed" : "pointer",
              fontFamily: "Outfit, sans-serif",
              opacity: cargando ? 0.6 : 1,
            }}
          >
            {Object.keys(pendientes).length > 0
              ? "✓ Confirmar despacho parcial"
              : "✓ Confirmar despacho"}
          </button>
        </div>
      )}
    </Layout>
  );
}
