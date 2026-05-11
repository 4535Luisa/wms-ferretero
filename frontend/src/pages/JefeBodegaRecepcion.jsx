import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import Etiqueta from "../components/Etiqueta";
import api from "../services/api";

export default function JefeBodegaRecepcion() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [vista, setVista] = useState("lista");
  const [recepciones, setRecepciones] = useState([]);
  const [recepcionActiva, setRecepcionActiva] = useState(null);
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [items, setItems] = useState([]);
  const [scanInput, setScanInput] = useState("");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [buscando, setBuscando] = useState(false);
  const [etiquetaActual, setEtiquetaActual] = useState(null);
  const [colaEtiquetas, setColaEtiquetas] = useState([]);
  const scanRef = useRef(null);

  useEffect(() => {
    cargarRecepciones();
  }, []);

  useEffect(() => {
    if (vista === "recibiendo" && scanRef.current) scanRef.current.focus();
  }, [vista]);

  const cargarRecepciones = async () => {
    try {
      const { data } = await api.get(
        `/api/recepciones?bodega_id=${usuario.bodega_id}`,
      );
      setRecepciones(data);
    } catch (err) {
      console.error(err);
    }
  };

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3000);
  };

  const iniciarRecepcion = async () => {
    if (!proveedor.trim())
      return mostrarMensaje("El proveedor es obligatorio", "error");
    try {
      const { data } = await api.post("/api/recepciones", {
        bodega_id: usuario.bodega_id,
        proveedor,
        numero_oc: factura,
      });
      setRecepcionActiva(data.recepcion);
      setItems([]);
      setVista("recibiendo");
      mostrarMensaje("Recepción iniciada — comienza a escanear");
    } catch {
      mostrarMensaje("Error al iniciar la recepción", "error");
    }
  };

  const buscarProducto = async (referencia) => {
    if (!referencia.trim()) return;
    setBuscando(true);
    try {
      const { data } = await api.get(
        `/api/productos/buscar?referencia=${referencia.trim()}`,
      );
      if (!data) {
        mostrarMensaje(`Referencia ${referencia} no encontrada`, "error");
        setScanInput("");
        setBuscando(false);
        return;
      }
      const existente = items.find((i) => i.producto_id === data.id);
      if (existente) {
        setItems((prev) =>
          prev.map((i) =>
            i.producto_id === data.id
              ? { ...i, cantidad_recibida: i.cantidad_recibida + 1 }
              : i,
          ),
        );
        mostrarMensaje(`+1 → ${data.descripcion_corta}`);
      } else {
        setItems((prev) => [
          ...prev,
          {
            producto_id: data.id,
            referencia: data.codigo_interno,
            descripcion: data.descripcion_corta,
            unidad_empaque: data.unidad_empaque,
            cantidad_recibida: 1,
          },
        ]);
        mostrarMensaje(`✓ Agregado: ${data.descripcion_corta}`);
      }
      setScanInput("");
    } catch {
      mostrarMensaje(`Referencia ${referencia} no encontrada`, "error");
      setScanInput("");
    } finally {
      setBuscando(false);
      if (scanRef.current) scanRef.current.focus();
    }
  };

  const actualizarCantidad = (producto_id, cantidad) => {
    setItems((prev) =>
      prev.map((i) =>
        i.producto_id === producto_id
          ? { ...i, cantidad_recibida: Number(cantidad) }
          : i,
      ),
    );
  };

  const eliminarItem = (producto_id) => {
    setItems((prev) => prev.filter((i) => i.producto_id !== producto_id));
  };

  const confirmarRecepcion = async () => {
    if (items.length === 0)
      return mostrarMensaje("No hay productos escaneados", "error");
    try {
      for (const item of items) {
        await api.post(`/api/recepciones/${recepcionActiva.id}/items`, {
          producto_id: item.producto_id,
          cantidad_recibida: item.cantidad_recibida,
        });
      }
      await api.patch(
        `/api/recepciones/${recepcionActiva.id}/confirmar-directo`,
      );
      mostrarMensaje("✓ Recepción confirmada — inventario actualizado");

      const cola = items.map((item) => ({
        producto: {
          referencia: item.referencia,
          descripcion: item.descripcion,
        },
        cantidad: item.cantidad_recibida,
      }));
      setColaEtiquetas(cola);
      setEtiquetaActual(cola[0]);

      cargarRecepciones();
      setVista("lista");
      setProveedor("");
      setFactura("");
      setItems([]);
    } catch (err) {
      mostrarMensaje(
        "Error al confirmar: " + (err.response?.data?.error || ""),
        "error",
      );
    }
  };

  const siguienteEtiqueta = () => {
    const restantes = colaEtiquetas.slice(1);
    setColaEtiquetas(restantes);
    setEtiquetaActual(restantes.length > 0 ? restantes[0] : null);
  };

  const abrirRecepcion = async (id) => {
    try {
      const { data } = await api.get(`/api/recepciones/${id}`);
      setRecepcionActiva(data);
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  const estadoBadge = (estado) => {
    const map = {
      en_proceso: { label: "En proceso", bg: "#FFF9E6", color: "#B45309" },
      confirmada: {
        label: "Confirmada",
        bg: "rgba(0,255,135,0.1)",
        color: "#007A40",
      },
      cancelada: { label: "Cancelada", bg: "#FEE2E2", color: "#991B1B" },
    };
    return map[estado] || { label: estado, bg: "#F3F4F6", color: "#374151" };
  };

  const subtitulos = {
    lista: "Historial de recepciones",
    nueva: "Nueva recepción",
    recibiendo: `Escaneando productos — ${proveedor}`,
    detalle: "Detalle de recepción",
  };

  return (
    <Layout titulo="Recepciones" subtitulo={subtitulos[vista]}>
      {etiquetaActual && (
        <Etiqueta
          producto={etiquetaActual.producto}
          cantidad={etiquetaActual.cantidad}
          onCerrar={siguienteEtiqueta}
        />
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "1.5rem" }}>
        {vista !== "lista" && (
          <button
            className="btn-outline"
            onClick={() => setVista("lista")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            ← Volver
          </button>
        )}
        {vista === "lista" && (
          <button
            className="btn-verde"
            onClick={() => setVista("nueva")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            + Nueva recepción
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
        <div>
          {recepciones.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
                color: "#BBB",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "1rem" }}>📥</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No hay recepciones registradas
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                Crea una nueva para empezar
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {recepciones.map((r) => {
                const badge = estadoBadge(r.estado);
                return (
                  <div
                    key={r.id}
                    onClick={() => abrirRecepcion(r.id)}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1.25rem 1.5rem",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
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
                        alignItems: "center",
                        gap: "1rem",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          background: "#F0F0F0",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "20px",
                        }}
                      >
                        📥
                      </div>
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 600,
                            fontSize: "14px",
                            color: "#0A0A0A",
                          }}
                        >
                          {r.proveedor}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: "12px",
                            color: "#888",
                          }}
                        >
                          Factura: {r.numero_oc || "Sin número"} ·{" "}
                          {new Date(r.created_at).toLocaleDateString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {badge.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {vista === "nueva" && (
        <div style={{ maxWidth: "520px" }}>
          <div
            className="card"
            style={{ borderRadius: "12px", padding: "2rem" }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#888",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Proveedor *
              </label>
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div style={{ marginBottom: "2rem" }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#888",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Número de factura
              </label>
              <input
                value={factura}
                onChange={(e) => setFactura(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <button
              className="btn-verde"
              onClick={iniciarRecepcion}
              style={{ width: "100%", padding: "12px", fontSize: "15px" }}
            >
              Iniciar recepción →
            </button>
          </div>
        </div>
      )}

      {vista === "recibiendo" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 380px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          <div>
            <div
              className="card"
              style={{
                borderRadius: "12px",
                padding: "1.5rem",
                marginBottom: "1rem",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#888",
                  marginBottom: "12px",
                }}
              >
                Escanea o digita la referencia
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  ref={scanRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarProducto(scanInput);
                  }}
                  placeholder="Referencia — ej: 120212"
                  style={{
                    fontSize: "18px",
                    fontFamily: "DM Mono, monospace",
                    fontWeight: 500,
                  }}
                  autoFocus
                />
                <button
                  onClick={() => buscarProducto(scanInput)}
                  disabled={buscando}
                  className="btn-verde"
                  style={{ flexShrink: 0, padding: "10px 20px" }}
                >
                  {buscando ? "..." : "Agregar"}
                </button>
              </div>
              <p style={{ fontSize: "12px", color: "#BBB", marginTop: "8px" }}>
                Presiona Enter después de escanear
              </p>
            </div>

            {items.length === 0 ? (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px dashed #E8E8E8",
                  borderRadius: "12px",
                  padding: "3rem",
                  textAlign: "center",
                }}
              >
                <p style={{ color: "#BBB", fontSize: "14px" }}>
                  Aún no hay productos escaneados
                </p>
              </div>
            ) : (
              <div
                className="card"
                style={{ borderRadius: "12px", padding: "0" }}
              >
                {items.map((item, idx) => {
                  const esCaja =
                    item.unidad_empaque &&
                    item.cantidad_recibida % item.unidad_empaque === 0;
                  return (
                    <div
                      key={item.producto_id}
                      style={{
                        padding: "1rem 1.25rem",
                        borderBottom:
                          idx < items.length - 1 ? "1px solid #F0F0F0" : "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "6px",
                          background: "#F0F0F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "13px",
                          fontFamily: "DM Mono, monospace",
                          fontWeight: 500,
                          color: "#555",
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.descripcion}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontFamily: "DM Mono, monospace",
                              color: "#888",
                            }}
                          >
                            {item.referencia}
                          </span>
                          {item.unidad_empaque && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: "4px",
                                letterSpacing: "0.04em",
                                background: esCaja
                                  ? "rgba(0,255,135,0.1)"
                                  : "#FEF9C3",
                                color: esCaja ? "#007A40" : "#854D0E",
                              }}
                            >
                              {esCaja
                                ? `✓ ${item.cantidad_recibida / item.unidad_empaque} caja(s)`
                                : `⚠ Saldo (x${item.unidad_empaque})`}
                            </span>
                          )}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={item.cantidad_recibida}
                        onChange={(e) =>
                          actualizarCantidad(item.producto_id, e.target.value)
                        }
                        min="1"
                        style={{
                          width: "72px",
                          textAlign: "center",
                          fontFamily: "DM Mono, monospace",
                          fontSize: "15px",
                          fontWeight: 600,
                        }}
                      />
                      <button
                        onClick={() => eliminarItem(item.producto_id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#DDD",
                          cursor: "pointer",
                          fontSize: "20px",
                          padding: "0 4px",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#FF4444")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "#DDD")
                        }
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div
              className="card"
              style={{ borderRadius: "12px", padding: "1.5rem" }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#888",
                  marginBottom: "1rem",
                }}
              >
                Resumen
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginBottom: "1.5rem",
                }}
              >
                {[
                  { label: "Proveedor", value: proveedor },
                  { label: "Factura", value: factura || "—" },
                  { label: "Referencias", value: items.length },
                  {
                    label: "Total unidades",
                    value: items.reduce((a, i) => a + i.cantidad_recibida, 0),
                  },
                  {
                    label: "Cajas completas",
                    value: items.filter(
                      (i) =>
                        i.unidad_empaque &&
                        i.cantidad_recibida % i.unidad_empaque === 0,
                    ).length,
                  },
                  {
                    label: "Con saldo",
                    value: items.filter(
                      (i) =>
                        i.unidad_empaque &&
                        i.cantidad_recibida % i.unidad_empaque !== 0,
                    ).length,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "13px",
                      paddingBottom: "8px",
                      borderBottom: "1px solid #F5F5F5",
                    }}
                  >
                    <span style={{ color: "#888" }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: "#0A0A0A" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <button
                className="btn-verde"
                onClick={confirmarRecepcion}
                disabled={items.length === 0}
                style={{ width: "100%", padding: "12px", fontSize: "14px" }}
              >
                Confirmar recepción ✓
              </button>
              <p
                style={{
                  fontSize: "11px",
                  color: "#AAA",
                  marginTop: "8px",
                  textAlign: "center",
                }}
              >
                Se imprimirá una etiqueta por cada producto
              </p>
            </div>
          </div>
        </div>
      )}

      {vista === "detalle" && recepcionActiva && (
        <div style={{ maxWidth: "680px" }}>
          <div
            className="card"
            style={{ borderRadius: "12px", padding: "1.5rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid #F0F0F0",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "16px" }}>
                  {recepcionActiva.proveedor}
                </p>
                <p
                  style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}
                >
                  Factura: {recepcionActiva.numero_oc || "Sin número"} ·{" "}
                  {new Date(recepcionActiva.created_at).toLocaleDateString(
                    "es-CO",
                  )}
                </p>
              </div>
              {(() => {
                const badge = estadoBadge(recepcionActiva.estado);
                return (
                  <div
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      padding: "4px 12px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {badge.label}
                  </div>
                );
              })()}
            </div>
            {recepcionActiva.recepcion_items?.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  padding: "0.875rem 0",
                  borderBottom:
                    idx < recepcionActiva.recepcion_items.length - 1
                      ? "1px solid #F5F5F5"
                      : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>
                    {item.productos?.descripcion_corta}
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
                </div>
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 700,
                      fontFamily: "DM Mono, monospace",
                    }}
                  >
                    {item.cantidad_recibida}
                  </p>
                  <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>
                    unidades
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
