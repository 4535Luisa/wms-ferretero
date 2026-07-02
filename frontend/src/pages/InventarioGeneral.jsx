import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const ROLES_PERMITIDOS = [
  "administrador",
  "jefe_bodega",
  "gerente_logistico",
  "inventarios",
  "facturacion",
  "montacarguista",
];

const ACCIONES = {
  PICKING: "Picking",
  RECEPCION_CONFIRMADA: "Recepción",
  ENTREGA_SALDOS: "Entrega saldos",
  RECEPCION_SALDOS: "Recepción saldos",
  CANCELACION_PICKING: "Cancelación picking",
  AJUSTE: "Ajuste",
  TRASLADO_SALIDA: "Traslado salida",
  TRASLADO_ENTRADA: "Traslado entrada",
};

export default function InventarioGeneral() {
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({
    referencia: "",
    descripcion: "",
    bodega: "",
  });
  const [movimientos, setMovimientos] = useState(null);
  const [productoSel, setProductoSel] = useState(null);
  const [cargandoMov, setCargandoMov] = useState(false);
  const [posMenu, setPosMenu] = useState({ x: 0, y: 0 });
  const [menuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef(null);
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
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuVisible(false);
        setMovimientos(null);
      }
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("touchstart", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("touchstart", cerrar);
    };
  }, []);

  const abrirMovimientos = async (producto, x, y) => {
    setProductoSel(producto);
    setPosMenu({ x, y });
    setMenuVisible(true);
    setMovimientos(null);
    setCargandoMov(true);
    try {
      const { data } = await api.get(
        `/api/productos/${producto.producto_id}/historial`,
      );
      setMovimientos(data.movimientos || []);
    } catch {
      setMovimientos([]);
    } finally {
      setCargandoMov(false);
    }
  };

  // Click derecho en escritorio
  const onContextMenu = (e, row) => {
    e.preventDefault();
    abrirMovimientos(row, e.clientX, e.clientY);
  };

  // Click sostenido en móvil
  const onTouchStart = (e, row) => {
    longPressTimer.current = setTimeout(() => {
      const t = e.touches[0];
      abrirMovimientos(row, t.clientX, t.clientY);
    }, 600);
  };

  const onTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

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
          { key: "referencia", placeholder: "Filtrar referencia..." },
          { key: "descripcion", placeholder: "Filtrar descripción..." },
          { key: "bodega", placeholder: "Filtrar bodega..." },
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
              fontFamily: "Outfit, sans-serif",
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
            fontFamily: "Outfit, sans-serif",
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
            fontFamily: "Outfit, sans-serif",
            color: "#00FF87",
            fontWeight: 700,
          }}
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Tip */}
      <p
        style={{
          fontSize: "12px",
          color: "#AAA",
          marginBottom: "10px",
          fontStyle: "italic",
        }}
      >
        💡 Click derecho (escritorio) o mantén presionado (móvil) una fila para
        ver los movimientos
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

      {/* Tabla */}
      {cargando ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
          Cargando inventario...
        </div>
      ) : filtrado.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
          Sin resultados
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            borderRadius: "12px",
            border: "1px solid #E8E8E8",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              fontFamily: "Outfit, sans-serif",
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
                  "Disponible real",
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
                      fontFamily: "Outfit, sans-serif",
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
                return (
                  <tr
                    key={`${row.producto_id}-${row.bodega}-${row.ubicacion || i}`}
                    onContextMenu={(e) => onContextMenu(e, row)}
                    onTouchStart={(e) => onTouchStart(e, row)}
                    onTouchEnd={onTouchEnd}
                    onTouchMove={onTouchEnd}
                    style={{
                      background: i % 2 === 0 ? "#F8F8F8" : "#FFFFFF",
                      cursor: "context-menu",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(0,255,135,0.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        i % 2 === 0 ? "#F8F8F8" : "#FFFFFF")
                    }
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
                        maxWidth: "280px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.descripcion}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
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
                      {(row.cantidad_comprometida || 0).toLocaleString("es-CO")}
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
        </div>
      )}

      {/* Panel de movimientos */}
      {menuVisible && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: Math.min(posMenu.y, window.innerHeight - 420),
            left: Math.min(posMenu.x, window.innerWidth - 380),
            width: "360px",
            maxHeight: "400px",
            background: "#FFFFFF",
            border: "1.5px solid #E8E8E8",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            zIndex: 1000,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
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
                  fontSize: "14px",
                }}
              >
                {productoSel?.referencia}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "11px",
                  marginTop: "2px",
                }}
              >
                {productoSel?.descripcion}
              </div>
            </div>
            <button
              onClick={() => {
                setMenuVisible(false);
                setMovimientos(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px 8px",
              }}
            >
              ×
            </button>
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {cargandoMov ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#888",
                  fontSize: "13px",
                }}
              >
                Cargando movimientos...
              </div>
            ) : movimientos?.length === 0 ? (
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
              movimientos?.map((m, i) => {
                const antes = m.valores_antes?.cantidad_disponible ?? "—";
                const despues = m.valores_despues?.cantidad_disponible ?? "—";
                const diff =
                  typeof antes === "number" && typeof despues === "number"
                    ? despues - antes
                    : null;
                return (
                  <div
                    key={m.id || i}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid #F0F0F0",
                      display: "flex",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        minWidth: "28px",
                        height: "28px",
                        borderRadius: "50%",
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
                        flexShrink: 0,
                      }}
                    >
                      {diff === null ? "·" : diff >= 0 ? "↑" : "↓"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#0A0A0A",
                          }}
                        >
                          {ACCIONES[m.accion] || m.accion}
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
                        {m.valores_despues?.bodega_id &&
                          ` · ${m.valores_despues.bodega_id.slice(0, 8)}...`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
