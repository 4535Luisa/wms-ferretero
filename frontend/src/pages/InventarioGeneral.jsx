import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

export default function InventarioGeneral() {
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({
    referencia: "",
    descripcion: "",
    bodega: "",
  });
  const [panelRef, setPanelRef] = useState(null); // referencia seleccionada para el panel lateral
  const [panelData, setPanelData] = useState(null); // { producto, movimientos, inventario (todas ubicaciones) }
  const [cargandoPanel, setCargandoPanel] = useState(false);
  const [pestanaPanel, setPestanaPanel] = useState("ubicaciones"); // "ubicaciones" | "pedidos" | "movimientos"
  const panelRef2 = useRef(null);
  const longPressTimer = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get("/api/productos/inventario-general");
      setInventario(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const cerrar = (e) => {
      if (panelRef2.current && !panelRef2.current.contains(e.target)) {
        setPanelRef(null);
        setPanelData(null);
      }
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("touchstart", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("touchstart", cerrar);
    };
  }, []);

  const abrirPanel = async (row) => {
    setPanelRef(row);
    setPanelData(null);
    setCargandoPanel(true);
    setPestanaPanel("ubicaciones");
    try {
      const { data } = await api.get(
        `/api/productos/${row.producto_id}/historial`,
      );
      setPanelData(data);
    } catch {
      setPanelData({ producto: null, movimientos: [], inventario: [] });
    } finally {
      setCargandoPanel(false);
    }
  };

  const onContextMenu = (e, row) => {
    e.preventDefault();
    abrirPanel(row);
  };
  const onTouchStart = (e, row) => {
    longPressTimer.current = setTimeout(() => abrirPanel(row), 600);
  };
  const onTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // Agrupar inventario por producto_id para mostrar todas las ubicaciones en el panel
  const inventarioPorProducto = panelData?.inventario || [];
  const totalDisponibleProd = inventarioPorProducto.reduce(
    (a, r) => a + (r.cantidad_disponible || 0),
    0,
  );
  const totalCompProd = inventarioPorProducto.reduce(
    (a, r) => a + (r.cantidad_comprometida || 0),
    0,
  );

  const filtrado = inventario.filter((r) => {
    const ref = filtros.referencia.toLowerCase();
    const desc = filtros.descripcion.toLowerCase();
    const bod = filtros.bodega.toLowerCase();
    return (
      (!ref || (r.referencia || "").toLowerCase().includes(ref)) &&
      (!desc || (r.descripcion || "").toLowerCase().includes(desc)) &&
      (!bod || (r.bodega || "").toLowerCase().includes(bod))
    );
  });

  const totalDisp = filtrado.reduce(
    (a, r) => a + (r.cantidad_disponible || 0),
    0,
  );
  const totalComp = filtrado.reduce(
    (a, r) => a + (r.cantidad_comprometida || 0),
    0,
  );

  return (
    <Layout
      titulo="Inventario General"
      subtitulo={`${filtrado.length} registros`}
    >
      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { key: "referencia", placeholder: "🔍 Filtrar referencia..." },
          { key: "descripcion", placeholder: "🔍 Filtrar descripción..." },
          { key: "bodega", placeholder: "🔍 Filtrar bodega..." },
        ].map(({ key, placeholder }) => (
          <input
            key={key}
            value={filtros[key]}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, [key]: e.target.value }))
            }
            placeholder={placeholder}
            style={{
              flex: 1,
              minWidth: "160px",
              padding: "9px 12px",
              border: "1.5px solid #E8E8E8",
              borderRadius: "8px",
              fontSize: "13px",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#00FF87")}
            onBlur={(e) => (e.target.style.borderColor = "#E8E8E8")}
          />
        ))}
        <button
          onClick={() =>
            setFiltros({ referencia: "", descripcion: "", bodega: "" })
          }
          style={{
            padding: "9px 16px",
            border: "1.5px solid #E8E8E8",
            borderRadius: "8px",
            background: "transparent",
            fontSize: "13px",
            cursor: "pointer",
            color: "#888",
          }}
        >
          Limpiar
        </button>
        <button
          onClick={cargar}
          style={{
            padding: "9px 16px",
            border: "none",
            borderRadius: "8px",
            background: "#0A0A0A",
            fontSize: "13px",
            cursor: "pointer",
            color: "#00FF87",
            fontWeight: 700,
          }}
        >
          ↻ Actualizar
        </button>
      </div>

      <p
        style={{
          fontSize: "12px",
          color: "#AAA",
          marginBottom: "10px",
          fontStyle: "italic",
        }}
      >
        💡 Click derecho (PC) o mantén presionado (celular) para ver
        ubicaciones, pedidos comprometidos y movimientos
      </p>

      {/* Totales */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Registros", valor: filtrado.length, color: "#0A0A0A" },
          {
            label: "Total disponible",
            valor: totalDisp.toLocaleString("es-CO"),
            color: "#007A40",
          },
          {
            label: "Total comprometido",
            valor: totalComp.toLocaleString("es-CO"),
            color: "#993C1D",
          },
          {
            label: "Disponible real",
            valor: (totalDisp - totalComp).toLocaleString("es-CO"),
            color: "#1E40AF",
          },
        ].map(({ label, valor, color }) => (
          <div
            key={label}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "10px",
              padding: "10px 16px",
              flex: 1,
              minWidth: "120px",
            }}
          >
            <div
              style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                fontFamily: "DM Mono, monospace",
                color,
              }}
            >
              {valor}
            </div>
          </div>
        ))}
      </div>

      {/* Layout: tabla + panel lateral */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {/* Tabla */}
        <div
          style={{
            flex: 1,
            overflowX: "auto",
            borderRadius: "12px",
            border: "1px solid #E8E8E8",
          }}
        >
          {cargando ? (
            <div
              style={{ textAlign: "center", padding: "3rem", color: "#888" }}
            >
              Cargando inventario...
            </div>
          ) : filtrado.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "3rem", color: "#888" }}
            >
              Sin resultados
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ background: "#0A0A0A" }}>
                  {[
                    "Referencia",
                    "Descripción",
                    "Bodega",
                    "Ubicación",
                    "Disponible",
                    "Comprometido",
                    "Real",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        color: "#00FF87",
                        fontWeight: 700,
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrado.map((row, i) => {
                  const real =
                    (row.cantidad_disponible || 0) -
                    (row.cantidad_comprometida || 0);
                  const seleccionado =
                    panelRef?.producto_id === row.producto_id;
                  return (
                    <tr
                      key={`${row.producto_id}-${row.bodega}-${row.ubicacion || i}`}
                      onContextMenu={(e) => onContextMenu(e, row)}
                      onTouchStart={(e) => onTouchStart(e, row)}
                      onTouchEnd={onTouchEnd}
                      onTouchMove={onTouchEnd}
                      style={{
                        background: seleccionado
                          ? "rgba(0,255,135,0.08)"
                          : i % 2 === 0
                            ? "#F8F8F8"
                            : "#FFFFFF",
                        cursor: "context-menu",
                      }}
                      onMouseEnter={(e) => {
                        if (!seleccionado)
                          e.currentTarget.style.background =
                            "rgba(0,255,135,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        if (!seleccionado)
                          e.currentTarget.style.background =
                            i % 2 === 0 ? "#F8F8F8" : "#FFFFFF";
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          fontFamily: "DM Mono, monospace",
                          fontWeight: 700,
                          color: "#0A0A0A",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.referencia}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          color: "#374151",
                          maxWidth: "220px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.descripcion}
                      </td>
                      <td
                        style={{ padding: "10px 14px", whiteSpace: "nowrap" }}
                      >
                        <span
                          style={{
                            background: "#0A0A0A",
                            color: "#00FF87",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            fontFamily: "DM Mono, monospace",
                          }}
                        >
                          {row.bodega || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          color: "#888",
                          fontFamily: "DM Mono, monospace",
                          fontSize: "12px",
                        }}
                      >
                        {row.ubicacion || "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontFamily: "DM Mono, monospace",
                          fontWeight: 700,
                          color: "#007A40",
                        }}
                      >
                        {(row.cantidad_disponible || 0).toLocaleString("es-CO")}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontFamily: "DM Mono, monospace",
                          fontWeight: 700,
                          color:
                            row.cantidad_comprometida > 0 ? "#993C1D" : "#888",
                        }}
                      >
                        {(row.cantidad_comprometida || 0).toLocaleString(
                          "es-CO",
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontFamily: "DM Mono, monospace",
                          fontWeight: 700,
                          color: real < 0 ? "#991B1B" : "#1E40AF",
                        }}
                      >
                        {real.toLocaleString("es-CO")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Panel lateral */}
        {panelRef && (
          <div
            ref={panelRef2}
            style={{
              width: "340px",
              flexShrink: 0,
              background: "#FFFFFF",
              border: "1.5px solid #E8E8E8",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            }}
          >
            {/* Header del panel */}
            <div
              style={{
                padding: "14px 16px",
                background: "#0A0A0A",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#00FF87",
                    fontWeight: 700,
                    fontFamily: "DM Mono, monospace",
                    fontSize: "15px",
                  }}
                >
                  {panelRef.referencia}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "11px",
                    marginTop: "2px",
                  }}
                >
                  {panelRef.descripcion}
                </div>
              </div>
              <button
                onClick={() => {
                  setPanelRef(null);
                  setPanelData(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  fontSize: "20px",
                  lineHeight: 1,
                  padding: "4px 8px",
                }}
              >
                ×
              </button>
            </div>

            {/* Resumen totales del producto */}
            {!cargandoPanel && panelData && (
              <div
                style={{ display: "flex", borderBottom: "1px solid #F0F0F0" }}
              >
                {[
                  {
                    label: "Disponible",
                    valor: totalDisponibleProd,
                    color: "#007A40",
                  },
                  {
                    label: "Comprometido",
                    valor: totalCompProd,
                    color: "#993C1D",
                  },
                  {
                    label: "Real",
                    valor: totalDisponibleProd - totalCompProd,
                    color: "#1E40AF",
                  },
                ].map(({ label, valor, color }) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      textAlign: "center",
                      borderRight: "1px solid #F0F0F0",
                    }}
                  >
                    <div style={{ fontSize: "10px", color: "#888" }}>
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        fontFamily: "DM Mono, monospace",
                        color,
                      }}
                    >
                      {valor.toLocaleString("es-CO")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs del panel */}
            <div style={{ display: "flex", borderBottom: "1px solid #F0F0F0" }}>
              {[
                ["ubicaciones", "📍 Ubicaciones"],
                ["pedidos", "📋 Comprometido"],
                ["movimientos", "📜 Movimientos"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPestanaPanel(tab)}
                  style={{
                    flex: 1,
                    padding: "10px 4px",
                    border: "none",
                    background: "transparent",
                    fontSize: "11px",
                    fontWeight: pestanaPanel === tab ? 700 : 400,
                    color: pestanaPanel === tab ? "#0A0A0A" : "#888",
                    cursor: "pointer",
                    borderBottom:
                      pestanaPanel === tab
                        ? "2px solid #00FF87"
                        : "2px solid transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contenido del panel */}
            <div style={{ maxHeight: "420px", overflowY: "auto" }}>
              {cargandoPanel ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "13px",
                  }}
                >
                  Cargando...
                </div>
              ) : !panelData ? null : pestanaPanel === "ubicaciones" ? (
                // Todas las ubicaciones donde está esta referencia
                inventarioPorProducto.length === 0 ? (
                  <div
                    style={{
                      padding: "2rem",
                      textAlign: "center",
                      color: "#888",
                      fontSize: "13px",
                    }}
                  >
                    Sin stock en bodega
                  </div>
                ) : (
                  inventarioPorProducto.map((inv, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #F8F8F8",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "DM Mono, monospace",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "#0A0A0A",
                          }}
                        >
                          {inv.ubicaciones?.codigo || "Sin ubicación"}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            marginTop: "2px",
                          }}
                        >
                          {inv.bodegas?.nombre || inv.bodegas?.codigo}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontFamily: "DM Mono, monospace",
                            fontWeight: 700,
                            fontSize: "14px",
                            color: "#007A40",
                          }}
                        >
                          {(inv.cantidad_disponible || 0).toLocaleString(
                            "es-CO",
                          )}
                        </div>
                        {inv.cantidad_comprometida > 0 && (
                          <div style={{ fontSize: "11px", color: "#993C1D" }}>
                            −{inv.cantidad_comprometida.toLocaleString("es-CO")}{" "}
                            comp.
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : pestanaPanel === "pedidos" ? (
                // Pedidos que tienen esta referencia comprometida
                <div style={{ padding: "12px 16px" }}>
                  {inventarioPorProducto.every(
                    (r) => !r.cantidad_comprometida,
                  ) ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        color: "#888",
                        fontSize: "13px",
                      }}
                    >
                      Sin stock comprometido
                    </div>
                  ) : (
                    inventarioPorProducto
                      .filter((r) => r.cantidad_comprometida > 0)
                      .map((inv, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "10px 0",
                            borderBottom: "1px solid #F8F8F8",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#0A0A0A",
                              fontWeight: 600,
                            }}
                          >
                            {inv.ubicaciones?.codigo || "Sin ubicación"} ·{" "}
                            {inv.bodegas?.codigo}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#993C1D",
                              marginTop: "2px",
                            }}
                          >
                            {inv.cantidad_comprometida.toLocaleString("es-CO")}{" "}
                            unidades comprometidas
                          </div>
                        </div>
                      ))
                  )}
                </div>
              ) : // Movimientos / historial
              (panelData.movimientos || []).length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "13px",
                  }}
                >
                  Sin movimientos registrados
                </div>
              ) : (
                (panelData.movimientos || []).map((m, i) => {
                  const antes = m.valores_antes?.cantidad_disponible ?? null;
                  const despues =
                    m.valores_despues?.cantidad_disponible ?? null;
                  const diff =
                    antes !== null && despues !== null ? despues - antes : null;
                  return (
                    <div
                      key={m.id || i}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #F0F0F0",
                        display: "flex",
                        gap: "10px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          minWidth: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          flexShrink: 0,
                          background:
                            diff === null
                              ? "#F0F0F0"
                              : diff >= 0
                                ? "rgba(0,255,135,0.1)"
                                : "rgba(153,60,29,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                        }}
                      >
                        {diff === null ? "·" : diff >= 0 ? "↑" : "↓"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#0A0A0A",
                            }}
                          >
                            {m.accion}
                          </span>
                          {diff !== null && (
                            <span
                              style={{
                                fontSize: "12px",
                                fontFamily: "DM Mono, monospace",
                                fontWeight: 700,
                                color: diff >= 0 ? "#007A40" : "#993C1D",
                              }}
                            >
                              {diff >= 0 ? "+" : ""}
                              {diff.toLocaleString("es-CO")}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            marginTop: "2px",
                          }}
                        >
                          {new Date(m.created_at).toLocaleString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {m.usuarios?.nombre && ` · ${m.usuarios.nombre}`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
