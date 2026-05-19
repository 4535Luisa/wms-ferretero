import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import api from "../services/api";

export default function Montacarguista() {
  const { usuario } = useAuth();
  const [listas, setListas] = useState([]);
  const [listaActiva, setListaActiva] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargarListas();
  }, []);

  const cargarListas = async () => {
    try {
      const { data } = await api.get("/api/picking/mis-listas");
      setListas(data);
    } catch (err) {
      console.error(err);
    }
  };

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3000);
  };

  const abrirLista = (lista) => {
    setListaActiva(lista);
    setVista("barrido");
  };

  const marcarBajada = async (itemId) => {
    setCargando(true);
    try {
      await api.patch(`/api/picking/items/${itemId}/bajar`);
      mostrarMensaje("✓ Caja registrada como bajada");
      const { data } = await api.get("/api/picking/mis-listas");
      setListas(data);
      const listaActualizada = data.find((l) => l.id === listaActiva?.id);
      if (listaActualizada) setListaActiva(listaActualizada);
    } catch (err) {
      mostrarMensaje("Error al registrar", "error");
    } finally {
      setCargando(false);
    }
  };

  const estadoColor = (estado) => {
    if (estado === "bajada")
      return { bg: "rgba(0,255,135,0.1)", color: "#007A40" };
    return { bg: "#F3F4F6", color: "#374151" };
  };

  return (
    <Layout
      titulo="Mis Listas"
      subtitulo={
        vista === "lista"
          ? `${listas.length} listas asignadas`
          : `${listaActiva?.bodegas?.nombre} — ${listaActiva?.lista_picking_items?.length} ítems`
      }
    >
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

      {vista === "lista" && (
        <div>
          {listas.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📦</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No tienes listas asignadas
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                El administrador te asignará una lista cuando haya pedidos
                pendientes
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {listas.map((lista) => {
                const total = lista.lista_picking_items?.length || 0;
                const bajadas =
                  lista.lista_picking_items?.filter(
                    (i) => i.estado === "bajada",
                  ).length || 0;
                const porcentaje =
                  total > 0 ? Math.round((bajadas / total) * 100) : 0;
                return (
                  <div
                    key={lista.id}
                    onClick={() => abrirLista(lista)}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "1rem",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "Bebas Neue, sans-serif",
                            fontSize: "22px",
                            letterSpacing: "0.04em",
                            color: "#0A0A0A",
                          }}
                        >
                          {lista.bodegas?.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#888",
                            marginTop: "4px",
                          }}
                        >
                          {total} ítems ·{" "}
                          {lista.lista_picking_items?.reduce(
                            (a, i) => a + (i.cantidad_cajas || 0),
                            0,
                          )}{" "}
                          cajas
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontFamily: "Bebas Neue, sans-serif",
                            fontSize: "28px",
                            color: porcentaje === 100 ? "#00CC6A" : "#0A0A0A",
                          }}
                        >
                          {porcentaje}%
                        </div>
                        <div style={{ fontSize: "12px", color: "#888" }}>
                          {bajadas}/{total} bajadas
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#F0F0F0",
                        borderRadius: "4px",
                        height: "6px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          background: "#00FF87",
                          height: "100%",
                          width: `${porcentaje}%`,
                          borderRadius: "4px",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {vista === "barrido" && listaActiva && (
        <div>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", color: "#888" }}>
                Progreso del barrido
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  fontFamily: "DM Mono, monospace",
                  color: "#0A0A0A",
                  marginTop: "2px",
                }}
              >
                {
                  listaActiva.lista_picking_items?.filter(
                    (i) => i.estado === "bajada",
                  ).length
                }{" "}
                / {listaActiva.lista_picking_items?.length} cajas
              </div>
            </div>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "#F0F0F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "18px",
                  color: "#0A0A0A",
                }}
              >
                {Math.round(
                  ((listaActiva.lista_picking_items?.filter(
                    (i) => i.estado === "bajada",
                  ).length || 0) /
                    (listaActiva.lista_picking_items?.length || 1)) *
                    100,
                )}
                %
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(listaActiva.lista_picking_items || [])
              .sort((a, b) => {
                const ua = a.ubicaciones?.codigo || "";
                const ub = b.ubicaciones?.codigo || "";
                return ua.localeCompare(ub);
              })
              .map((item) => {
                const bajada = item.estado === "bajada";
                const badge = estadoColor(item.estado);
                return (
                  <div
                    key={item.id}
                    style={{
                      background: bajada ? "rgba(0,255,135,0.04)" : "#FFFFFF",
                      border: bajada
                        ? "1px solid rgba(0,255,135,0.2)"
                        : "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1rem 1.25rem",
                      opacity: bajada ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              background: "#0A0A0A",
                              color: "#00FF87",
                              padding: "2px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontFamily: "DM Mono, monospace",
                              fontWeight: 700,
                            }}
                          >
                            {item.ubicaciones?.codigo || "Sin ubic."}
                          </span>
                          {item.destino_saldos && (
                            <span
                              style={{
                                background: "#FEF9C3",
                                color: "#854D0E",
                                padding: "2px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: 700,
                              }}
                            >
                              → SALDOS
                            </span>
                          )}
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            {bajada ? "✓ Bajada" : "Pendiente"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#0A0A0A",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.descripcion}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            fontFamily: "DM Mono, monospace",
                            marginTop: "2px",
                          }}
                        >
                          {item.referencia} · Pedido: {item.pedidos?.numero}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: 700,
                            fontFamily: "DM Mono, monospace",
                            color: "#0A0A0A",
                          }}
                        >
                          {item.cantidad_cajas}{" "}
                          {item.cantidad_cajas === 1 ? "caja" : "cajas"}
                        </div>
                        {!bajada && (
                          <button
                            onClick={() => marcarBajada(item.id)}
                            disabled={cargando}
                            style={{
                              marginTop: "8px",
                              background: "#00FF87",
                              color: "#0A0A0A",
                              border: "none",
                              borderRadius: "8px",
                              padding: "8px 14px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                              minHeight: "44px",
                              minWidth: "80px",
                            }}
                          >
                            Bajar ↓
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </Layout>
  );
}
