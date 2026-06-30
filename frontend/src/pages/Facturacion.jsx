import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

export default function Facturacion() {
  const [pedidos, setPedidos] = useState([]);
  const [facturados, setFacturados] = useState([]);
  const [tab, setTab] = useState("pendientes");
  const [pedidoActivo, setPedidoActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  // Cola "por facturar": pedidos ya despachados por el jefe que aún no se han
  // facturado. (El estado se mantiene en "despachado"; el flag `facturado`
  // distingue la cola del historial.)
  const cargarPedidos = async () => {
    try {
      const { data } = await api.get("/api/pedidos?estado=despachado");
      setPedidos(data.filter((p) => !p.facturado));
    } catch (err) {
      console.error(err);
    }
  };

  // Historial: pedidos despachados que ya fueron facturados.
  const cargarFacturados = async () => {
    try {
      const { data } = await api.get("/api/pedidos?estado=despachado");
      setFacturados(data.filter((p) => p.facturado));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPedidos();
    cargarFacturados();
  }, []);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 4000);
  };

  const abrirPedido = async (id) => {
    try {
      const { data } = await api.get(`/api/pedidos/${id}`);
      setPedidoActivo(data);
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  const marcarFacturado = async () => {
    if (!pedidoActivo) return;
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/${pedidoActivo.id}/facturar`);
      mostrarMensaje("✓ Pedido facturado — inventario actualizado");
      cargarPedidos();
      cargarFacturados();
      setVista("lista");
      setPedidoActivo(null);
    } catch (err) {
      mostrarMensaje(
        "Error al facturar: " + (err.response?.data?.error || ""),
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout
      titulo="Facturación"
      subtitulo={
        vista === "lista"
          ? tab === "pendientes"
            ? `${pedidos.length} pedidos pendientes de facturar`
            : `${facturados.length} pedidos facturados`
          : `Pedido ${pedidoActivo?.numero}`
      }
    >
      <div style={{ display: "flex", gap: "8px", marginBottom: "1.25rem" }}>
        {vista !== "lista" && (
          <button
            onClick={() => setVista("lista")}
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
            }}
          >
            ← Volver
          </button>
        )}
      </div>

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

      {vista === "lista" && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "1.25rem",
            borderBottom: "1px solid #F0F0F0",
          }}
        >
          {[
            { id: "pendientes", label: `Por facturar (${pedidos.length})` },
            { id: "historial", label: `Historial (${facturados.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${tab === t.id ? "#00CC6A" : "transparent"}`,
                color: tab === t.id ? "#0A0A0A" : "#888",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 4px",
                fontFamily: "Outfit, sans-serif",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {vista === "lista" && tab === "pendientes" && (
        <div>
          {pedidos.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "1rem" }}>🧾</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No hay pedidos pendientes de facturar
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                Cuando el jefe de bodega despache un pedido aparecerá aquí
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {pedidos.map((pedido) => (
                <div
                  key={pedido.id}
                  onClick={() => abrirPedido(pedido.id)}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1.25rem 1.5rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "DM Mono, monospace",
                          fontSize: "14px",
                          fontWeight: 700,
                        }}
                      >
                        {pedido.numero}
                      </span>
                      <span
                        style={{
                          background: "rgba(0,255,135,0.1)",
                          color: "#007A40",
                          padding: "2px 10px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                        }}
                      >
                        LISTO PARA FACTURAR
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#888",
                        marginTop: "4px",
                      }}
                    >
                      {pedido.pedido_items?.length || 0} referencias ·{" "}
                      {pedido.pedido_items?.reduce(
                        (a, i) => a + (i.cantidad_pedida || 0),
                        0,
                      ) || 0}{" "}
                      unidades
                      {pedido.hora_cierre && (
                        <span style={{ marginLeft: "8px" }}>
                          · Cerrado:{" "}
                          {new Date(pedido.hora_cierre).toLocaleString(
                            "es-CO",
                            {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "#00CC6A",
                      fontWeight: 600,
                    }}
                  >
                    Ver →
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vista === "lista" && tab === "historial" && (
        <div>
          {facturados.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "1rem" }}>📚</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                Aún no hay pedidos facturados
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {facturados.map((pedido) => (
                <div
                  key={pedido.id}
                  onClick={() => abrirPedido(pedido.id)}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1.25rem 1.5rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "DM Mono, monospace",
                          fontSize: "14px",
                          fontWeight: 700,
                        }}
                      >
                        {pedido.numero}
                      </span>
                      <span
                        style={{
                          background: "#F3F4F6",
                          color: "#374151",
                          padding: "2px 10px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                        }}
                      >
                        FACTURADO
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#888",
                        marginTop: "4px",
                      }}
                    >
                      {pedido.pedido_items?.length || 0} referencias ·{" "}
                      {pedido.pedido_items?.reduce(
                        (a, i) =>
                          a + (i.cantidad_picking ?? i.cantidad_pedida ?? 0),
                        0,
                      ) || 0}{" "}
                      unidades
                      {pedido.facturador?.nombre && (
                        <span style={{ marginLeft: "8px" }}>
                          · Por: {pedido.facturador.nombre}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {pedido.hora_facturacion && (
                      <div style={{ fontSize: "12px", color: "#888" }}>
                        {new Date(pedido.hora_facturacion).toLocaleString(
                          "es-CO",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#00CC6A",
                        fontWeight: 600,
                      }}
                    >
                      Ver →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vista === "detalle" && pedidoActivo && (
        <div style={{ maxWidth: "720px" }}>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                marginBottom: "1.25rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid #F0F0F0",
              }}
            >
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                {pedidoActivo.numero}
              </div>
              <div
                style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}
              >
                {pedidoActivo.pedido_items?.length} referencias
              </div>
            </div>

            {pedidoActivo.pedido_items?.map((item, idx) => {
              const cantidadFinal =
                item.cantidad_picking || item.cantidad_pedida;
              const hayDiferencia = cantidadFinal !== item.cantidad_pedida;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "0.875rem 0",
                    borderBottom:
                      idx < pedidoActivo.pedido_items.length - 1
                        ? "1px solid #F5F5F5"
                        : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>
                      {item.productos?.descripcion_corta || item.descripcion}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "11px",
                        color: "#888",
                        fontFamily: "DM Mono, monospace",
                      }}
                    >
                      {item.productos?.codigo_interno}
                    </p>
                    {hayDiferencia && item.motivo_diferencia && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "11px",
                          color: "#854D0E",
                          background: "#FEF9C3",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          display: "inline-block",
                        }}
                      >
                        ⚠ {item.motivo_diferencia}
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      flexShrink: 0,
                      marginLeft: "1rem",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "DM Mono, monospace",
                        fontSize: "15px",
                        fontWeight: 700,
                        color: hayDiferencia ? "#854D0E" : "#0A0A0A",
                      }}
                    >
                      {cantidadFinal}
                      {hayDiferencia && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            fontWeight: 400,
                            marginLeft: "4px",
                          }}
                        >
                          (pedido: {item.cantidad_pedida})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888" }}>
                      unidades
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(pedidoActivo.transportadora ||
            pedidoActivo.guia_transporte ||
            pedidoActivo.conductor ||
            pedidoActivo.placa_vehiculo ||
            pedidoActivo.bultos != null) && (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem 1.5rem",
                marginBottom: "1rem",
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
                🚛 Despacho y transportista
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px 16px",
                  fontSize: "13px",
                }}
              >
                {[
                  ["Bultos", pedidoActivo.bultos],
                  [
                    "Peso (kg)",
                    pedidoActivo.peso_kg != null ? pedidoActivo.peso_kg : null,
                  ],
                  ["Transportadora", pedidoActivo.transportadora],
                  ["N° guía / remesa", pedidoActivo.guia_transporte],
                  ["Conductor", pedidoActivo.conductor],
                  ["Placa", pedidoActivo.placa_vehiculo],
                ]
                  .filter(([, v]) => v != null && v !== "")
                  .map(([k, v]) => (
                    <div key={k}>
                      <div style={{ color: "#888", fontSize: "11px" }}>{k}</div>
                      <div style={{ fontWeight: 600, color: "#0A0A0A" }}>
                        {v}
                      </div>
                    </div>
                  ))}
              </div>
              {pedidoActivo.despacho_parcial && (
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#854D0E",
                    background: "#FEF9C3",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    display: "inline-block",
                  }}
                >
                  ⚠ Despacho parcial
                </div>
              )}
            </div>
          )}

          {pedidoActivo.facturado ? (
            <div
              style={{
                background: "rgba(0,255,135,0.06)",
                border: "1px solid rgba(0,255,135,0.25)",
                borderRadius: "10px",
                padding: "14px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#007A40",
                  margin: 0,
                }}
              >
                ✓ Pedido facturado
                {pedidoActivo.hora_facturacion &&
                  ` — ${new Date(pedidoActivo.hora_facturacion).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              </p>
              {pedidoActivo.facturador?.nombre && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    margin: "4px 0 0",
                  }}
                >
                  Por: {pedidoActivo.facturador.nombre}
                </p>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={marcarFacturado}
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
                {cargando
                  ? "Procesando..."
                  : "✓ Marcar como facturado — descontar inventario"}
              </button>
              <p
                style={{
                  fontSize: "11px",
                  color: "#AAA",
                  textAlign: "center",
                  marginTop: "8px",
                }}
              >
                Esta acción descuenta las unidades del inventario general y no se
                puede deshacer
              </p>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
