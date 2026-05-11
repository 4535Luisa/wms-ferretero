import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
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
  parcial: { bg: "#FEF9C3", color: "#854D0E", label: "Parcial" },
  cancelado: { bg: "#FEE2E2", color: "#991B1B", label: "Cancelado" },
};

export default function AdminPedidos() {
  const { usuario } = useAuth();
  const [vista, setVista] = useState("lista");
  const [pedidos, setPedidos] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [montacarguistas, setMontacarguistas] = useState([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [asignacion, setAsignacion] = useState({
    operario_id: "",
    montacarguista_id: "",
  });
  const [previaCsv, setPreviaCsv] = useState([]);
  const [bodegaSeleccionada, setBodegaSeleccionada] = useState("");
  const [bodegas, setBodegas] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [{ data: p }, { data: o }, { data: b }] = await Promise.all([
        api.get("/api/pedidos"),
        api.get("/api/pedidos/operarios"),
        api.get("/api/usuarios/bodegas"),
      ]);
      setPedidos(p);
      setOperarios(o.filter((u) => u.rol === "operario"));
      setMontacarguistas(o.filter((u) => u.rol === "montacarguista"));
      setBodegas(b);
      if (b.length > 0) setBodegaSeleccionada(b[0].id);
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

        if (!pedidosMap[numero]) {
          pedidosMap[numero] = { numero, items: [] };
        }
        pedidosMap[numero].items.push({ referencia, descripcion, cantidad });
      }
      setPreviaCsv(Object.values(pedidosMap));
      setVista("preview");
    };
    reader.readAsArrayBuffer(file);
  };

  const importarPedidos = async () => {
    if (!bodegaSeleccionada)
      return mostrarMensaje("Selecciona una bodega", "error");
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
          bodega_id: bodegaSeleccionada,
          items: itemsConIds,
        });
      }

      const { data } = await api.post("/api/pedidos/csv", {
        pedidos: pedidosConIds,
      });
      mostrarMensaje(
        `✓ ${data.importados} pedidos importados · ${data.omitidos} ya existían`,
      );
      cargarDatos();
      setVista("lista");
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

  const abrirAsignacion = (pedido) => {
    setPedidoSeleccionado(pedido);
    setAsignacion({
      operario_id: pedido.operario_id || "",
      montacarguista_id: pedido.montacarguista_id || "",
    });
    setVista("asignar");
  };

  const guardarAsignacion = async () => {
    if (!asignacion.operario_id && !asignacion.montacarguista_id) {
      return mostrarMensaje(
        "Asigna al menos un operario o montacarguista",
        "error",
      );
    }
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/${pedidoSeleccionado.id}/asignar`, {
        operario_id: asignacion.operario_id || null,
        montacarguista_id: asignacion.montacarguista_id || null,
      });
      mostrarMensaje("✓ Pedido asignado correctamente");
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

  const pedidosFiltrados = pedidos.filter((p) =>
    filtroEstado ? p.estado === filtroEstado : true,
  );

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#888",
    display: "block",
    marginBottom: "7px",
  };

  const selectStyle = {
    width: "100%",
    fontFamily: "Outfit, sans-serif",
    fontSize: "14px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    padding: "10px 14px",
    outline: "none",
    background: "#FFFFFF",
    color: "#0A0A0A",
  };

  return (
    <Layout
      titulo="Pedidos"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedidos en el sistema`
          : vista === "preview"
            ? `${previaCsv.length} pedidos detectados en el CSV`
            : "Asignar pedido"
      }
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
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

      {/* LISTA */}
      {vista === "lista" && (
        <div>
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
                {filtroEstado
                  ? "No hay pedidos con ese estado"
                  : "No hay pedidos cargados"}
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                Carga un CSV de SIESA para empezar
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {pedidosFiltrados.map((pedido) => {
                const badge =
                  estadoColor[pedido.estado] || estadoColor.pendiente;
                const operario = pedido["usuarios!pedidos_operario_id_fkey"];
                const montacarguista =
                  pedido["usuarios!pedidos_montacarguista_id_fkey"];
                return (
                  <div
                    key={pedido.id}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1.25rem 1.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "10px",
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
                              color: "#0A0A0A",
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
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {pedido.estado === "pendiente" && (
                          <button
                            onClick={() => abrirAsignacion(pedido)}
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
                              minHeight: "44px",
                            }}
                          >
                            Asignar →
                          </button>
                        )}
                      </div>
                    </div>

                    {(operario || montacarguista) && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        {operario && (
                          <div style={{ fontSize: "12px", color: "#555" }}>
                            👷 Operario: <strong>{operario.nombre}</strong>
                          </div>
                        )}
                        {montacarguista && (
                          <div style={{ fontSize: "12px", color: "#555" }}>
                            🚜 Montacarguista:{" "}
                            <strong>{montacarguista.nombre}</strong>
                          </div>
                        )}
                        {pedido.hora_asignacion && (
                          <div style={{ fontSize: "12px", color: "#AAA" }}>
                            Asignado:{" "}
                            {new Date(pedido.hora_asignacion).toLocaleString(
                              "es-CO",
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
              marginBottom: "1rem",
            }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Asignar a bodega</label>
              <select
                value={bodegaSeleccionada}
                onChange={(e) => setBodegaSeleccionada(e.target.value)}
                style={selectStyle}
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} ({b.codigo})
                  </option>
                ))}
              </select>
            </div>

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
                      {pedido.items.length} referencias ·{" "}
                      {pedido.items.reduce((a, i) => a + i.cantidad, 0)}{" "}
                      unidades
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
                ? "Importando..."
                : `Importar ${previaCsv.length} pedidos →`}
            </button>
          </div>
        </div>
      )}

      {/* ASIGNAR */}
      {vista === "asignar" && pedidoSeleccionado && (
        <div style={{ maxWidth: "520px" }}>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.75rem",
            }}
          >
            <div
              style={{
                marginBottom: "1.5rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid #F0F0F0",
              }}
            >
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "16px",
                  fontWeight: 700,
                }}
              >
                {pedidoSeleccionado.numero}
              </div>
              <div
                style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}
              >
                {pedidoSeleccionado.pedido_items?.length} referencias ·{" "}
                {pedidoSeleccionado.pedido_items?.reduce(
                  (a, i) => a + (i.cantidad_pedida || 0),
                  0,
                )}{" "}
                unidades
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Operario (picker)</label>
              <select
                value={asignacion.operario_id}
                onChange={(e) =>
                  setAsignacion((p) => ({ ...p, operario_id: e.target.value }))
                }
                style={selectStyle}
              >
                <option value="">Sin asignar</option>
                {operarios.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "2rem" }}>
              <label style={labelStyle}>Montacarguista</label>
              <select
                value={asignacion.montacarguista_id}
                onChange={(e) =>
                  setAsignacion((p) => ({
                    ...p,
                    montacarguista_id: e.target.value,
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

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setVista("lista")}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "#0A0A0A",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                  minHeight: "44px",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarAsignacion}
                disabled={cargando}
                style={{
                  flex: 2,
                  background: "#00FF87",
                  color: "#0A0A0A",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: cargando ? "not-allowed" : "pointer",
                  fontFamily: "Outfit, sans-serif",
                  minHeight: "44px",
                  opacity: cargando ? 0.6 : 1,
                }}
              >
                {cargando ? "Asignando..." : "Confirmar asignación →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
