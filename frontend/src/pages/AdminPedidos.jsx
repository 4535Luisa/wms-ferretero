import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import api from "../services/api";

const estadoColor = {
  pendiente: { bg: "#F3F4F6", color: "#374151", label: "Pendiente" },
  asignado: { bg: "#DBEAFE", color: "#1E40AF", label: "Asignado" },
  en_picking: { bg: "#FEF9C3", color: "#854D0E", label: "En picking" },
  en_saldos: { bg: "#EDE9FE", color: "#5B21B6", label: "En saldos" },
  en_verificacion: {
    bg: "rgba(0,255,135,0.1)",
    color: "#007A40",
    label: "Verificando",
  },
  despachado: {
    bg: "rgba(0,255,135,0.15)",
    color: "#005A30",
    label: "Despachado",
  },
  cancelado: { bg: "#FEE2E2", color: "#991B1B", label: "Cancelado" },
};

const prioridadColor = {
  normal: { bg: "#F3F4F6", color: "#374151", label: "Normal" },
  urgente: { bg: "#FEE2E2", color: "#991B1B", label: "Urgente" },
};

export default function AdminPedidos() {
  const [vista, setVista] = useState("lista");
  const [pedidos, setPedidos] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [montacarguistas, setMontacarguistas] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [listas, setListas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [operarioTanda, setOperarioTanda] = useState("");
  const [montacarguistasPorBodega, setMontacarguistasPorBodega] = useState({});
  const [previaCsv, setPreviaCsv] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [{ data: p }, { data: o }, { data: b }, { data: l }] =
        await Promise.all([
          api.get("/api/pedidos"),
          api.get("/api/pedidos/operarios"),
          api.get("/api/usuarios/bodegas"),
          api.get("/api/picking"),
        ]);
      setPedidos(p);
      setOperarios(o.filter((u) => u.rol === "operario"));
      setMontacarguistas(o.filter((u) => u.rol === "montacarguista"));
      setBodegas(b);
      setListas(l);
    } catch (err) {
      console.error(err);
    }
  };

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 4000);
  };

  const leerCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const pedidosMap = {};
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0] || !row[1]) continue;
        const numero = String(row[0]).trim();
        const referencia = String(row[1]).trim();
        const descripcion = String(row[2] || "").trim();
        const cantidad = Number(row[3]) || 0;
        if (!pedidosMap[numero]) pedidosMap[numero] = { numero, items: [] };
        pedidosMap[numero].items.push({ referencia, descripcion, cantidad });
      }
      setPreviaCsv(Object.values(pedidosMap));
      setVista("preview");
    };
    reader.readAsArrayBuffer(file);
  };

  const importarPedidos = async () => {
    if (previaCsv.length === 0)
      return mostrarMensaje("No hay pedidos para importar", "error");
    setCargando(true);
    try {
      const productosCache = {};
      const pedidosConIds = [];
      for (const pedido of previaCsv) {
        const itemsConIds = [];
        for (const item of pedido.items) {
          if (!productosCache[item.referencia]) {
            try {
              const { data } = await api.get(
                `/api/productos/buscar?referencia=${item.referencia}`,
              );
              productosCache[item.referencia] = data;
            } catch {
              productosCache[item.referencia] = null;
            }
          }
          const producto = productosCache[item.referencia];
          if (producto) {
            itemsConIds.push({
              producto_id: producto.id,
              cantidad_pedida: item.cantidad,
              descripcion: item.descripcion,
            });
          }
        }
        pedidosConIds.push({
          numero: pedido.numero,
          bodega_id: null,
          items: itemsConIds,
        });
      }

      const { data: importResult } = await api.post("/api/pedidos/csv", {
        pedidos: pedidosConIds,
      });
      mostrarMensaje(
        `✓ ${importResult.importados} pedidos importados · generando listas de picking...`,
      );

      const pedidosNuevos = await api.get("/api/pedidos?estado=pendiente");
      const ids = pedidosNuevos.data.map((p) => p.id);

      if (ids.length > 0) {
        const { data: listasResult } = await api.post("/api/picking/generar", {
          pedido_ids: ids,
        });
        mostrarMensaje(
          `✓ ${importResult.importados} pedidos importados · ${listasResult.listas.length} listas de picking generadas`,
        );
      }

      await cargarDatos();
      setVista("listas");
      setPreviaCsv([]);
    } catch (err) {
      mostrarMensaje(
        "Error al importar: " + (err.response?.data?.error || ""),
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const toggleSeleccion = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleTodos = () => {
    const pendientes = pedidosFiltrados
      .filter((p) => p.estado === "pendiente")
      .map((p) => p.id);
    if (seleccionados.length === pendientes.length) setSeleccionados([]);
    else setSeleccionados(pendientes);
  };

  const cambiarPrioridad = async (pedidoId, prioridad) => {
    try {
      await api.patch(`/api/pedidos/${pedidoId}/prioridad`, { prioridad });
      cargarDatos();
    } catch (err) {
      console.error(err);
    }
  };

  const asignarTanda = async () => {
    if (!operarioTanda)
      return mostrarMensaje("Selecciona un operario", "error");
    setCargando(true);
    try {
      const asignacionesArray = seleccionados.map((pedido_id) => ({
        pedido_id,
        operario_id: operarioTanda,
        prioridad:
          pedidos.find((p) => p.id === pedido_id)?.prioridad || "normal",
      }));
      await api.post("/api/pedidos/tanda", {
        asignaciones: asignacionesArray,
        montacarguistas: montacarguistasPorBodega,
      });
      mostrarMensaje(
        `✓ ${seleccionados.length} pedidos asignados a ${operarios.find((o) => o.id === operarioTanda)?.nombre}`,
      );
      setSeleccionados([]);
      setOperarioTanda("");
      setMontacarguistasPorBodega({});
      cargarDatos();
      setVista("lista");
    } catch (err) {
      mostrarMensaje(
        "Error al asignar: " + (err.response?.data?.error || ""),
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const asignarMontacarguistaLista = async (listaId, montacarguistaId) => {
    try {
      await api.patch(`/api/picking/${listaId}/asignar`, {
        montacarguista_id: montacarguistaId,
      });
      mostrarMensaje("✓ Montacarguista asignado a la lista");
      cargarDatos();
    } catch (err) {
      mostrarMensaje("Error al asignar montacarguista", "error");
    }
  };

  const pedidosFiltrados = pedidos.filter((p) =>
    filtroEstado ? p.estado === filtroEstado : true,
  );
  const pedidosPendientes = pedidosFiltrados.filter(
    (p) => p.estado === "pendiente",
  );

  const selectStyle = {
    width: "100%",
    fontFamily: "Outfit, sans-serif",
    fontSize: "13px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    padding: "8px 12px",
    outline: "none",
    background: "#FFFFFF",
    color: "#0A0A0A",
  };
  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#888",
    display: "block",
    marginBottom: "6px",
  };

  return (
    <Layout
      titulo="Pedidos"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedidos · ${listas.filter((l) => l.estado === "pendiente").length} listas pendientes`
          : vista === "preview"
            ? `${previaCsv.length} pedidos detectados`
            : vista === "asignar"
              ? `${seleccionados.length} pedidos para asignar`
              : vista === "listas"
                ? `${listas.length} listas de picking`
                : ""
      }
    >
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "1.25rem",
          background: "#F0F0F0",
          padding: "4px",
          borderRadius: "10px",
          width: "fit-content",
        }}
      >
        {[
          { id: "lista", label: "📋 Pedidos" },
          { id: "listas", label: "📦 Listas picking" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setVista(tab.id)}
            style={{
              background: vista === tab.id ? "#FFFFFF" : "transparent",
              color: "#0A0A0A",
              border: "none",
              borderRadius: "7px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: vista === tab.id ? 700 : 400,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
              boxShadow:
                vista === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Acciones */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(vista === "preview" || vista === "asignar") && (
          <button
            onClick={() => {
              setVista("lista");
              setSeleccionados([]);
              setOperarioTanda("");
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
            }}
          >
            ← Volver
          </button>
        )}
        {vista === "lista" && (
          <>
            <label
              style={{
                background: "#00FF87",
                color: "#0A0A0A",
                border: "none",
                borderRadius: "8px",
                padding: "9px 20px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Outfit, sans-serif",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              📂 Cargar CSV
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={leerCSV}
                style={{ display: "none" }}
              />
            </label>
            {seleccionados.length > 0 && (
              <button
                onClick={() => setVista("asignar")}
                style={{
                  background: "#0A0A0A",
                  color: "#00FF87",
                  border: "none",
                  borderRadius: "8px",
                  padding: "9px 20px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                Asignar {seleccionados.length} pedido
                {seleccionados.length > 1 ? "s" : ""} →
              </button>
            )}
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ ...selectStyle, width: "auto", padding: "9px 14px" }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(estadoColor).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </>
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

      {/* LISTA DE PEDIDOS */}
      {vista === "lista" && (
        <div>
          {pedidosPendientes.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "0.75rem",
              }}
            >
              <input
                type="checkbox"
                checked={
                  seleccionados.length === pedidosPendientes.length &&
                  pedidosPendientes.length > 0
                }
                onChange={toggleTodos}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span style={{ fontSize: "13px", color: "#888" }}>
                {seleccionados.length > 0
                  ? `${seleccionados.length} seleccionados`
                  : "Seleccionar todos los pendientes"}
              </span>
            </div>
          )}
          {pedidosFiltrados.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "1rem" }}>📋</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No hay pedidos cargados
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {pedidosFiltrados.map((pedido) => {
                const badge =
                  estadoColor[pedido.estado] || estadoColor.pendiente;
                const pBadge =
                  prioridadColor[pedido.prioridad] || prioridadColor.normal;
                const esPendiente = pedido.estado === "pendiente";
                const estaSeleccionado = seleccionados.includes(pedido.id);
                return (
                  <div
                    key={pedido.id}
                    style={{
                      background: "#FFFFFF",
                      border: estaSeleccionado
                        ? "1.5px solid #00FF87"
                        : "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1rem 1.25rem",
                      boxShadow: estaSeleccionado
                        ? "0 0 0 3px rgba(0,255,135,0.08)"
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      {esPendiente && (
                        <input
                          type="checkbox"
                          checked={estaSeleccionado}
                          onChange={() => toggleSeleccion(pedido.id)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            marginTop: "2px",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
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
                              background: badge.bg,
                              color: badge.color,
                              padding: "2px 10px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                            }}
                          >
                            {badge.label}
                          </span>
                          <span
                            style={{
                              background: pBadge.bg,
                              color: pBadge.color,
                              padding: "2px 10px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                            }}
                          >
                            {pBadge.label}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#888",
                            marginTop: "4px",
                          }}
                        >
                          {pedido.pedido_items?.length || 0} ref ·{" "}
                          {pedido.pedido_items?.reduce(
                            (a, i) => a + (i.cantidad_pedida || 0),
                            0,
                          ) || 0}{" "}
                          und
                        </div>
                        {pedido.operario && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#555",
                              marginTop: "4px",
                            }}
                          >
                            👷 {pedido.operario.nombre}
                            {pedido.montacarguista &&
                              ` · 🚜 ${pedido.montacarguista.nombre}`}
                          </div>
                        )}
                      </div>
                      {esPendiente && (
                        <button
                          onClick={() =>
                            cambiarPrioridad(
                              pedido.id,
                              pedido.prioridad === "urgente"
                                ? "normal"
                                : "urgente",
                            )
                          }
                          style={{
                            background:
                              pedido.prioridad === "urgente"
                                ? "#FEE2E2"
                                : "#F3F4F6",
                            color:
                              pedido.prioridad === "urgente"
                                ? "#991B1B"
                                : "#374151",
                            border: "none",
                            borderRadius: "6px",
                            padding: "5px 10px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "Outfit, sans-serif",
                            flexShrink: 0,
                          }}
                        >
                          {pedido.prioridad === "urgente"
                            ? "🔴 Urgente"
                            : "⚡ Normal"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LISTAS DE PICKING */}
      {vista === "listas" && (
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
              <div style={{ fontSize: "40px", marginBottom: "1rem" }}>📦</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No hay listas de picking generadas
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                Las listas se generan automáticamente al cargar un CSV
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {listas.map((lista) => (
                <div
                  key={lista.id}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "1rem",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "Bebas Neue, sans-serif",
                            fontSize: "20px",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {lista.bodegas?.nombre || "Bodega"}
                        </span>
                        <span
                          style={{
                            background:
                              lista.estado === "asignada"
                                ? "rgba(0,255,135,0.1)"
                                : "#F3F4F6",
                            color:
                              lista.estado === "asignada"
                                ? "#007A40"
                                : "#374151",
                            padding: "2px 10px",
                            borderRadius: "20px",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {lista.estado === "asignada"
                            ? "Asignada"
                            : "Pendiente"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "4px",
                        }}
                      >
                        {lista.lista_picking_items?.length || 0} ítems ·{" "}
                        {lista.lista_picking_items?.reduce(
                          (a, i) => a + (i.cantidad_cajas || 0),
                          0,
                        ) || 0}{" "}
                        cajas
                        {lista.usuarios && ` · 🚜 ${lista.usuarios.nombre}`}
                      </div>
                    </div>
                    {lista.estado === "pendiente" && (
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <select
                          onChange={(e) =>
                            e.target.value &&
                            asignarMontacarguistaLista(lista.id, e.target.value)
                          }
                          defaultValue=""
                          style={{ ...selectStyle, width: "auto" }}
                        >
                          <option value="">Asignar montacarguista</option>
                          {montacarguistas.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid #F0F0F0",
                      paddingTop: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "8px",
                      }}
                    >
                      {(lista.lista_picking_items || []).map((item) => (
                        <div
                          key={item.id}
                          style={{
                            background: item.destino_saldos
                              ? "#FEF9C3"
                              : "#F8F8F8",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            border: item.destino_saldos
                              ? "1px solid #FDE68A"
                              : "1px solid transparent",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: "12px",
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
                                {item.referencia} ·{" "}
                                {item.ubicaciones?.codigo || "Sin ubicación"}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#555",
                                  marginTop: "2px",
                                }}
                              >
                                Pedido: {item.pedidos?.numero}
                              </div>
                            </div>
                            <div
                              style={{
                                textAlign: "right",
                                flexShrink: 0,
                                marginLeft: "8px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  fontFamily: "DM Mono, monospace",
                                  color: "#0A0A0A",
                                }}
                              >
                                {item.cantidad_cajas}{" "}
                                {item.cantidad_cajas === 1 ? "caja" : "cajas"}
                              </div>
                              {item.destino_saldos && (
                                <div
                                  style={{
                                    fontSize: "10px",
                                    color: "#854D0E",
                                    fontWeight: 600,
                                    marginTop: "2px",
                                  }}
                                >
                                  → SALDOS
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PREVIEW CSV */}
      {vista === "preview" && (
        <div>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <p
              style={{ fontSize: "13px", color: "#888", marginBottom: "1rem" }}
            >
              Al importar, el sistema generará automáticamente las listas de
              picking por bodega
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "1.5rem",
              }}
            >
              {previaCsv.map((pedido) => (
                <div
                  key={pedido.numero}
                  style={{
                    border: "1px solid #E8E8E8",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
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
                    <span style={{ fontSize: "12px", color: "#888" }}>
                      {pedido.items.length} ref ·{" "}
                      {pedido.items.reduce((a, i) => a + i.cantidad, 0)} und
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                    }}
                  >
                    {pedido.items.slice(0, 5).map((item, i) => (
                      <span
                        key={i}
                        style={{
                          background: "#F0F0F0",
                          color: "#555",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontFamily: "DM Mono, monospace",
                        }}
                      >
                        {item.referencia}
                      </span>
                    ))}
                    {pedido.items.length > 5 && (
                      <span style={{ fontSize: "11px", color: "#AAA" }}>
                        +{pedido.items.length - 5} más
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={importarPedidos}
              disabled={cargando}
              style={{
                width: "100%",
                background: "#00FF87",
                color: "#0A0A0A",
                border: "none",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: cargando ? "not-allowed" : "pointer",
                fontFamily: "Outfit, sans-serif",
                opacity: cargando ? 0.6 : 1,
              }}
            >
              {cargando
                ? "Importando y generando listas..."
                : `Importar ${previaCsv.length} pedidos y generar listas →`}
            </button>
          </div>
        </div>
      )}

      {/* ASIGNAR TANDA */}
      {vista === "asignar" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          <div>
            <p
              style={{ fontSize: "13px", color: "#888", marginBottom: "1rem" }}
            >
              Los siguientes pedidos se asignarán al mismo operario:
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {seleccionados.map((pedidoId) => {
                const pedido = pedidos.find((p) => p.id === pedidoId);
                if (!pedido) return null;
                const pBadge =
                  prioridadColor[pedido.prioridad] || prioridadColor.normal;
                return (
                  <div
                    key={pedidoId}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1rem 1.25rem",
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
                          fontFamily: "DM Mono, monospace",
                          fontSize: "14px",
                          fontWeight: 700,
                        }}
                      >
                        {pedido.numero}
                      </span>
                      <span
                        style={{
                          background: pBadge.bg,
                          color: pBadge.color,
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {pBadge.label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#888",
                        marginTop: "3px",
                      }}
                    >
                      {pedido.pedido_items?.length} ref ·{" "}
                      {pedido.pedido_items?.reduce(
                        (a, i) => a + (i.cantidad_pedida || 0),
                        0,
                      )}{" "}
                      und
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ position: "sticky", top: "1rem" }}>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1rem",
              }}
            >
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>
                  Operario para todos los pedidos *
                </label>
                <select
                  value={operarioTanda}
                  onChange={(e) => setOperarioTanda(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Selecciona un operario</option>
                  {operarios.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <p style={labelStyle}>Montacarguistas por bodega</p>
              {bodegas
                .filter((b) => b.codigo !== "SALDOS")
                .map((bodega) => (
                  <div key={bodega.id} style={{ marginBottom: "1rem" }}>
                    <label style={{ ...labelStyle, color: "#555" }}>
                      {bodega.nombre}
                    </label>
                    <select
                      value={montacarguistasPorBodega[bodega.id] || ""}
                      onChange={(e) =>
                        setMontacarguistasPorBodega((prev) => ({
                          ...prev,
                          [bodega.id]: e.target.value,
                        }))
                      }
                      style={selectStyle}
                    >
                      <option value="">Sin asignar</option>
                      {montacarguistas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>

            <button
              onClick={asignarTanda}
              disabled={cargando}
              style={{
                width: "100%",
                background: "#00FF87",
                color: "#0A0A0A",
                border: "none",
                borderRadius: "10px",
                padding: "14px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: cargando ? "not-allowed" : "pointer",
                fontFamily: "Outfit, sans-serif",
                opacity: cargando ? 0.6 : 1,
              }}
            >
              {cargando ? "Asignando..." : "Confirmar asignación →"}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
