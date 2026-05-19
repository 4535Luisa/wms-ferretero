import { useState } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const accionLabel = {
  RECEPCION_CONFIRMADA: {
    label: "Recepción",
    color: "#007A40",
    bg: "rgba(0,255,135,0.1)",
  },
  PICKING: { label: "Picking", color: "#1E40AF", bg: "#DBEAFE" },
  AJUSTE: { label: "Ajuste", color: "#854D0E", bg: "#FEF9C3" },
  TRASLADO: { label: "Traslado", color: "#5B21B6", bg: "#EDE9FE" },
  DESPACHO: { label: "Despacho", color: "#991B1B", bg: "#FEE2E2" },
};

export default function HistorialProducto() {
  const [referencia, setReferencia] = useState("");
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const buscar = async () => {
    if (!referencia.trim()) return;
    setCargando(true);
    setError("");
    setResultado(null);
    try {
      const { data: producto } = await api.get(
        `/api/productos/buscar?referencia=${referencia.trim()}`,
      );
      if (!producto) {
        setError(`Referencia ${referencia} no encontrada`);
        setCargando(false);
        return;
      }
      const { data } = await api.get(`/api/productos/${producto.id}/historial`);
      setResultado(data);
    } catch {
      setError("Error al buscar el producto");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout
      titulo="Historial de producto"
      subtitulo="Trazabilidad completa por referencia"
    >
      <div style={{ maxWidth: "720px" }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "8px",
            }}
          >
            Referencia del producto
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
              placeholder="Ej: 120212"
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: "16px",
                flex: 1,
              }}
              autoFocus
            />
            <button
              onClick={buscar}
              disabled={cargando}
              style={{
                background: "#00FF87",
                color: "#0A0A0A",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Outfit, sans-serif",
                flexShrink: 0,
              }}
            >
              {cargando ? "..." : "Buscar"}
            </button>
          </div>
          {error && (
            <p
              style={{
                fontSize: "13px",
                color: "#991B1B",
                marginTop: "8px",
                background: "#FEE2E2",
                padding: "8px 12px",
                borderRadius: "6px",
              }}
            >
              {error}
            </p>
          )}
        </div>

        {resultado && (
          <>
            {/* Info del producto */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      fontSize: "15px",
                      color: "#0A0A0A",
                    }}
                  >
                    {resultado.producto.descripcion_corta}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "12px",
                      color: "#888",
                      fontFamily: "DM Mono, monospace",
                    }}
                  >
                    Ref: {resultado.producto.codigo_interno} · Unidad de
                    empaque:{" "}
                    {resultado.producto.unidad_empaque || "No definida"}
                  </p>
                </div>
              </div>

              {resultado.inventario?.length > 0 && (
                <div
                  style={{
                    marginTop: "1rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid #F0F0F0",
                  }}
                >
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#888",
                      marginBottom: "8px",
                    }}
                  >
                    Stock actual por bodega
                  </p>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    {resultado.inventario.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          background: "#F8F8F8",
                          borderRadius: "8px",
                          padding: "8px 14px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#0A0A0A",
                            fontFamily: "DM Mono, monospace",
                          }}
                        >
                          {inv.cantidad_disponible} und
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            marginTop: "2px",
                          }}
                        >
                          {inv.bodegas?.nombre} ·{" "}
                          {inv.ubicaciones?.codigo || "Sin ubicación"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Historial de movimientos */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#888",
                  marginBottom: "1rem",
                }}
              >
                Historial de movimientos ({resultado.movimientos?.length || 0})
              </p>

              {!resultado.movimientos || resultado.movimientos.length === 0 ? (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#BBB",
                    textAlign: "center",
                    padding: "2rem 0",
                  }}
                >
                  No hay movimientos registrados para este producto
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {resultado.movimientos.map((mov) => {
                    const tipo = accionLabel[mov.accion] || {
                      label: mov.accion,
                      color: "#374151",
                      bg: "#F3F4F6",
                    };
                    return (
                      <div
                        key={mov.id}
                        style={{
                          border: "1px solid #F0F0F0",
                          borderRadius: "8px",
                          padding: "1rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                background: tipo.bg,
                                color: tipo.color,
                                padding: "2px 10px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                              }}
                            >
                              {tipo.label}
                            </span>
                            {mov.valores_despues?.proveedor && (
                              <span style={{ fontSize: "12px", color: "#555" }}>
                                {mov.valores_despues.proveedor}
                              </span>
                            )}
                            {mov.valores_despues?.factura && (
                              <span style={{ fontSize: "12px", color: "#888" }}>
                                Fact: {mov.valores_despues.factura}
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#AAA",
                              fontFamily: "DM Mono, monospace",
                              flexShrink: 0,
                            }}
                          >
                            {new Date(mov.created_at).toLocaleString("es-CO", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "1.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {mov.valores_antes?.cantidad_disponible !==
                            undefined && (
                            <div style={{ fontSize: "12px" }}>
                              <span style={{ color: "#888" }}>Antes: </span>
                              <span
                                style={{
                                  fontFamily: "DM Mono, monospace",
                                  fontWeight: 600,
                                }}
                              >
                                {mov.valores_antes.cantidad_disponible} und
                              </span>
                            </div>
                          )}
                          {mov.valores_despues?.cantidad_disponible !==
                            undefined && (
                            <div style={{ fontSize: "12px" }}>
                              <span style={{ color: "#888" }}>Después: </span>
                              <span
                                style={{
                                  fontFamily: "DM Mono, monospace",
                                  fontWeight: 600,
                                  color: "#007A40",
                                }}
                              >
                                {mov.valores_despues.cantidad_disponible} und
                              </span>
                            </div>
                          )}
                          {mov.valores_despues?.recepcion_id && (
                            <div style={{ fontSize: "12px", color: "#888" }}>
                              Bodega:{" "}
                              {mov.valores_despues.bodega_id?.slice(0, 8)}...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
