import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Pagina,
  Acciones,
  Boton,
  Tarjeta,
  FilaKpis,
  Kpi,
  Filtros,
  Campo,
  Mensaje,
  Tabla,
  Vacio,
  Pastilla,
  Pestanas,
  Modal,
} from "../components/oficina";
import { estiloCampo, COLOR } from "../components/oficinaDatos";
import { num } from "../components/panel/formato";

const estadoColor = {
  pendiente: { bg: "#EEF0F2", color: "#3A3F4B", label: "Pendiente" },
  asignado: { bg: "#DBEAFE", color: "#1E40AF", label: "Asignado" },
  en_proceso: { bg: "#FFF4D6", color: "#8A5A00", label: "En proceso" },
  en_picking: { bg: "#FFF4D6", color: "#8A5A00", label: "En picking" },
  en_saldos: { bg: "#EDE9FE", color: "#5B21B6", label: "En saldos" },
  cerrado: { bg: "#E0F2FE", color: "#0369A1", label: "Por verificar" },
  con_diferencia: { bg: "#FDECEC", color: "#B91C1C", label: "Con diferencia" },
  verificado: { bg: "#E3F7EC", color: "#007A40", label: "Verificado" },
  facturado: { bg: "#E3F7EC", color: "#005A30", label: "Facturado" },
  despachado: { bg: "#E3F7EC", color: "#005A30", label: "Despachado" },
  cancelado: { bg: "#FDECEC", color: "#B91C1C", label: "Cancelado" },
};
const estadoDe = (estado) =>
  estadoColor[estado] || { bg: "#EEF0F2", color: "#3A3F4B", label: estado || "—" };
// Estados en los que ya no se reasigna ni se cancela (igual que el backend).
const ESTADOS_FINALES = ["cerrado", "verificado", "facturado", "despachado", "cancelado"];
const NO_CANCELABLES = ["facturado", "despachado", "cancelado"];
const mono = { fontFamily: "DM Mono, monospace" };

const prioridadColor = {
  normal: { bg: "#EEF0F2", color: "#3A3F4B", label: "Normal" },
  urgente: { bg: "#FDECEC", color: "#B91C1C", label: "Urgente" },
};

const celdaStr = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

function PanelAdvertencias({ advertencias, onCerrar }) {
  if (!advertencias || advertencias.length === 0) return null;
  return (
    <div
      style={{
        background: "#FFFBEB",
        border: "1px solid #F2DFA6",
        borderRadius: "12px",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#8A5A00" }}>
            Stock insuficiente — {advertencias.length} referencia
            {advertencias.length > 1 ? "s" : ""} con problema
          </span>
          <p
            style={{ fontSize: "12px", color: "#8A5A00", margin: "2px 0 0 0" }}
          >
            Se alistará lo que haya disponible. Las unidades faltantes quedarán
            pendientes en SALDOS.
          </p>
        </div>
        <button
          onClick={onCerrar}
          style={{
            background: "transparent",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "#8A5A00",
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {advertencias.map((adv, i) => (
          <div
            key={i}
            style={{
              background: "#FFFFFF",
              border: "1px solid #FDE68A",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#0A0A0A",
                  marginBottom: "2px",
                }}
              >
                {adv.descripcion}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#4B5160",
                  fontFamily: "DM Mono, monospace",
                }}
              >
                {adv.referencia} · {adv.pedido_numero}
              </div>
              <div
                style={{ fontSize: "12px", color: "#8A5A00", marginTop: "4px" }}
              >
                {adv.motivo}
              </div>
            </div>
            {adv.cajas_requeridas > 0 && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#4B5160",
                    fontFamily: "DM Mono, monospace",
                  }}
                >
                  {adv.cajas_disponibles}/{adv.cajas_requeridas} cajas
                </div>
                {adv.cajas_faltantes > 0 && (
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#B91C1C",
                      fontFamily: "DM Mono, monospace",
                    }}
                  >
                    Faltan {adv.cajas_faltantes}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [modalCancelar, setModalCancelar] = useState(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [advertencias, setAdvertencias] = useState([]);
  const [busqueda, setBusqueda] = useState("");

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

  useEffect(() => {
    cargarDatos();
  }, []);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 6000);
  };

  const cancelarPedido = async () => {
    if (!modalCancelar || !motivoCancelacion.trim()) return;
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/${modalCancelar.id}/cancelar`, {
        motivo: motivoCancelacion.trim(),
      });
      mostrarMensaje(`Pedido ${modalCancelar.numero} cancelado`);
      setModalCancelar(null);
      setMotivoCancelacion("");
      cargarDatos();
    } catch (err) {
      mostrarMensaje(
        "Error al cancelar: " + (err.response?.data?.error || ""),
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const leerCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const palabrasNumero = [
          "nro",
          "numero",
          "número",
          "pedido",
          "documento",
        ];
        const palabrasRef = ["referencia", "ref"];
        const palabrasDesc = ["desc", "item", "articulo", "artículo", "nombre"];
        const palabrasCant = ["cant", "cantidad", "comprom", "pedida"];

        let colNumero = 0,
          colRef = 1,
          colDesc = 2,
          colCant = 3;
        let headerRow = 0;

        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const row = rows[i] || [];
          let hits = 0;
          let cN = -1,
            cR = -1,
            cD = -1,
            cC = -1;
          for (let j = 0; j < row.length; j++) {
            const cell = celdaStr(row[j]).toLowerCase();
            if (cN < 0 && palabrasNumero.some((p) => cell.includes(p))) {
              cN = j;
              hits++;
            }
            if (cR < 0 && palabrasRef.some((p) => cell.includes(p))) {
              cR = j;
              hits++;
            }
            if (cD < 0 && palabrasDesc.some((p) => cell.includes(p))) {
              cD = j;
              hits++;
            }
            if (cC < 0 && palabrasCant.some((p) => cell.includes(p))) {
              cC = j;
              hits++;
            }
          }
          if (hits >= 2) {
            headerRow = i;
            if (cN >= 0) colNumero = cN;
            if (cR >= 0) colRef = cR;
            if (cD >= 0) colDesc = cD;
            if (cC >= 0) colCant = cC;
            break;
          }
        }

        const pedidosMap = {};
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i] || [];
          const numero = celdaStr(row[colNumero]);
          let referencia = celdaStr(row[colRef]);
          const descripcion = celdaStr(row[colDesc]);
          const cantidad = Math.round(Number(celdaStr(row[colCant])) || 0);

          if (!numero || !referencia || cantidad <= 0) continue;

          if (/^\d+\.0+$/.test(referencia))
            referencia = String(Math.round(Number(referencia)));

          if (!pedidosMap[numero]) pedidosMap[numero] = { numero, items: [] };
          pedidosMap[numero].items.push({ referencia, descripcion, cantidad });
        }

        const pedidos = Object.values(pedidosMap);
        if (pedidos.length === 0) {
          mostrarMensaje(
            "El archivo no tiene filas validas. Verifica columnas: numero de pedido, referencia y cantidad.",
            "error",
          );
          return;
        }
        setPreviaCsv(pedidos);
        setVista("preview");
      } catch (err) {
        console.error("Error leyendo archivo:", err);
        mostrarMensaje(
          "No se pudo leer el archivo. Verifica que sea un CSV o Excel valido.",
          "error",
        );
      }
    };
    reader.onerror = () => mostrarMensaje("Error al leer el archivo", "error");
    reader.readAsArrayBuffer(file);
  };

  const importarPedidos = async () => {
    if (previaCsv.length === 0)
      return mostrarMensaje("No hay pedidos para importar", "error");
    setCargando(true);
    setAdvertencias([]);
    try {
      const productosCache = {};
      const pedidosConIds = [];
      const noEncontradas = new Set();
      for (const pedido of previaCsv) {
        const itemsConIds = [];
        for (const item of pedido.items) {
          if (!(item.referencia in productosCache)) {
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
          } else {
            noEncontradas.add(item.referencia);
          }
        }
        pedidosConIds.push({
          numero: pedido.numero,
          bodega_id: null,
          items: itemsConIds,
        });
      }

      const avisoRef =
        noEncontradas.size > 0
          ? ` · Aviso: ${noEncontradas.size} referencia(s) no encontradas y omitidas`
          : "";
      const { data: importResult } = await api.post("/api/pedidos/csv", {
        pedidos: pedidosConIds,
      });

      const { data: pedidosNuevos } = await api.get(
        "/api/pedidos?estado=pendiente",
      );
      const ids = pedidosNuevos.map((p) => p.id);
      if (ids.length > 0) {
        const { data: listasResult } = await api.post("/api/picking/generar", {
          pedido_ids: ids,
        });

        // Mostrar advertencias de stock insuficiente
        if (listasResult.advertencias && listasResult.advertencias.length > 0) {
          setAdvertencias(listasResult.advertencias);
        }

        mostrarMensaje(
          `${importResult.importados} pedidos importados · ${listasResult.listas.length} listas generadas${listasResult.advertencias?.length > 0 ? ` · ${listasResult.advertencias.length} referencia(s) con stock insuficiente` : ""}${avisoRef}`,
          listasResult.advertencias?.length > 0 || noEncontradas.size > 0
            ? "error"
            : "ok",
        );
      } else {
        mostrarMensaje(
          `${importResult.importados} pedidos importados${avisoRef}`,
          noEncontradas.size > 0 ? "error" : "ok",
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

  const generarListasManual = async () => {
    setCargando(true);
    setAdvertencias([]);
    try {
      const pedidosActivos = pedidos.filter((p) =>
        ["pendiente", "asignado", "en_picking"].includes(p.estado),
      );
      if (pedidosActivos.length === 0) {
        mostrarMensaje("No hay pedidos activos para generar listas", "error");
        setCargando(false);
        return;
      }
      const ids = pedidosActivos.map((p) => p.id);
      const { data } = await api.post("/api/picking/generar", {
        pedido_ids: ids,
      });

      // Mostrar advertencias de stock insuficiente
      if (data.advertencias && data.advertencias.length > 0) {
        setAdvertencias(data.advertencias);
      }

      mostrarMensaje(
        `${data.listas.length} listas generadas${data.advertencias?.length > 0 ? ` · ${data.advertencias.length} referencia(s) con stock insuficiente` : ""}`,
        data.advertencias?.length > 0 ? "error" : "ok",
      );
      cargarDatos();
    } catch (err) {
      mostrarMensaje(
        "Error al generar listas: " + (err.response?.data?.error || ""),
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const toggleSeleccion = (id) =>
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );

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

  const reasignar = async (pedidoId, nuevoOperarioId) => {
    if (!nuevoOperarioId) return;
    try {
      const { data } = await api.patch(`/api/pedidos/${pedidoId}/reasignar`, {
        operario_id: nuevoOperarioId,
      });
      mostrarMensaje(data.mensaje || "Pedido reasignado");
      cargarDatos();
    } catch (err) {
      mostrarMensaje(
        err.response?.data?.error || "Error al reasignar",
        "error",
      );
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
        `${seleccionados.length} pedidos asignados a ${operarios.find((o) => o.id === operarioTanda)?.nombre}`,
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
      mostrarMensaje("Montacarguista asignado a la lista");
      cargarDatos();
    } catch {
      mostrarMensaje("Error al asignar montacarguista", "error");
    }
  };

  const pedidosFiltrados = pedidos.filter((p) =>
    filtroEstado ? p.estado === filtroEstado : true,
  );
  const pedidosPendientes = pedidosFiltrados.filter(
    (p) => p.estado === "pendiente",
  );

  const unidades = (p) =>
    p.pedido_items?.reduce((a, i) => a + (i.cantidad_pedida || 0), 0) || 0;
  const cuenta = (estados) => pedidos.filter((p) => estados.includes(p.estado)).length;
  const listasPendientes = listas.filter((l) => l.estado === "pendiente").length;
  const textoBusqueda = busqueda.trim().toLowerCase();
  const pedidosVisibles = textoBusqueda
    ? pedidosFiltrados.filter((p) => String(p.numero).toLowerCase().includes(textoBusqueda))
    : pedidosFiltrados;

  const volverALista = () => {
    setVista("lista");
    setSeleccionados([]);
    setOperarioTanda("");
  };

  const columnasPedidos = [
    {
      titulo: "",
      ancho: "36px",
      celda: (p) =>
        p.estado === "pendiente" ? (
          <input
            type="checkbox"
            aria-label={`Seleccionar ${p.numero}`}
            checked={seleccionados.includes(p.id)}
            onChange={() => toggleSeleccion(p.id)}
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
        ) : null,
    },
    {
      titulo: "Pedido",
      celda: (p) => <span style={{ ...mono, fontWeight: 600 }}>{p.numero}</span>,
    },
    {
      titulo: "Estado",
      celda: (p) => {
        const e = estadoDe(p.estado);
        return <Pastilla texto={e.label} bg={e.bg} fg={e.color} />;
      },
    },
    {
      titulo: "Prioridad",
      celda: (p) => {
        const pr = prioridadColor[p.prioridad] || prioridadColor.normal;
        return p.estado === "pendiente" ? (
          <button
            type="button"
            title="Cambiar prioridad"
            onClick={() => cambiarPrioridad(p.id, p.prioridad === "urgente" ? "normal" : "urgente")}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <Pastilla texto={`${pr.label} ⇄`} bg={pr.bg} fg={pr.color} />
          </button>
        ) : (
          <Pastilla texto={pr.label} bg={pr.bg} fg={pr.color} />
        );
      },
    },
    { titulo: "Ref.", num: true, celda: (p) => num(p.pedido_items?.length || 0) },
    { titulo: "Unidades", num: true, celda: (p) => num(unidades(p)) },
    {
      titulo: "Operario",
      celda: (p) =>
        !p.operario ? (
          <span style={{ color: COLOR.gris }}>—</span>
        ) : (
          <span style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
            <span>
              {p.operario.nombre}
              {p.montacarguista && <span style={{ color: COLOR.gris }}> · {p.montacarguista.nombre}</span>}
            </span>
            {!ESTADOS_FINALES.includes(p.estado) && (
              <select
                value=""
                aria-label={`Reasignar ${p.numero}`}
                onChange={(e) => {
                  reasignar(p.id, e.target.value);
                  e.target.value = "";
                }}
                style={{ ...estiloCampo, minHeight: "32px", padding: "4px 8px", fontSize: "12px", width: "auto" }}
              >
                <option value="">↪ Reasignar a…</option>
                {operarios
                  .filter((o) => o.id !== p.operario_id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
              </select>
            )}
          </span>
        ),
    },
    {
      titulo: "",
      celda: (p) =>
        NO_CANCELABLES.includes(p.estado) ? null : (
          <Boton
            pequeno
            variante="peligro"
            onClick={() => {
              setMotivoCancelacion("");
              setModalCancelar(p);
            }}
          >
            Cancelar
          </Boton>
        ),
    },
  ];

  return (
    <Layout
      titulo="Pedidos"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedidos · ${listasPendientes} listas pendientes`
          : vista === "preview"
            ? `${previaCsv.length} pedidos detectados`
            : vista === "asignar"
              ? `${seleccionados.length} pedidos para asignar`
              : vista === "listas"
                ? `${listas.length} listas de picking`
                : ""
      }
    >
      <Pagina>
        {(vista === "lista" || vista === "listas") && (
          <Pestanas
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: "lista", texto: "Pedidos", cuenta: pedidos.length },
              { valor: "listas", texto: "Listas de picking", cuenta: listas.length },
            ]}
          />
        )}

        <Acciones>
          {(vista === "preview" || vista === "asignar") && <Boton onClick={volverALista}>← Volver</Boton>}
          {vista === "lista" && (
            <>
              <label
                style={{
                  font: "inherit",
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "10px 16px",
                  minHeight: "44px",
                  boxSizing: "border-box",
                  borderRadius: "8px",
                  background: COLOR.negro,
                  color: "#FFFFFF",
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                Cargar CSV o Excel
                <input type="file" accept=".csv,.xls,.xlsx" onChange={leerCSV} style={{ display: "none" }} />
              </label>
              {seleccionados.length > 0 && (
                <Boton variante="verde" onClick={() => setVista("asignar")}>
                  Asignar {seleccionados.length} pedido{seleccionados.length > 1 ? "s" : ""} →
                </Boton>
              )}
            </>
          )}
          {vista === "listas" && (
            <Boton variante="principal" onClick={generarListasManual} disabled={cargando}>
              {cargando ? "Generando..." : "Generar listas desde pedidos activos"}
            </Boton>
          )}
        </Acciones>

        <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>

        <PanelAdvertencias advertencias={advertencias} onCerrar={() => setAdvertencias([])} />

        {vista === "lista" && (
          <>
            <FilaKpis etiqueta="Resumen de pedidos">
              <Kpi etiqueta="Pendientes" valor={cuenta(["pendiente"])} pie="sin asignar" />
              <Kpi etiqueta="En curso" valor={cuenta(["asignado", "en_proceso", "en_picking", "en_saldos"])} pie="asignados o en alistamiento" />
              <Kpi
                etiqueta="Por verificar"
                valor={cuenta(["cerrado"])}
                colorValor={cuenta(["cerrado"]) > 0 ? COLOR.ambar : undefined}
                pie="cerrados por el operario"
              />
              <Kpi etiqueta="Listas pendientes" valor={listasPendientes} pie="sin montacarguista" />
            </FilaKpis>

            <Filtros>
              <Campo etiqueta="Buscar pedido" ancho="200px">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Número de pedido"
                  style={{ ...estiloCampo, ...mono }}
                />
              </Campo>
              <Campo etiqueta="Estado" ancho="180px">
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={estiloCampo}>
                  <option value="">Todos los estados</option>
                  {Object.entries(estadoColor).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Campo>
            </Filtros>

            <Tarjeta
              titulo="Pedidos"
              subtitulo={
                pedidosVisibles.length === pedidos.length
                  ? `${pedidos.length} en total`
                  : `${pedidosVisibles.length} de ${pedidos.length}`
              }
              extra={
                pedidosPendientes.length > 0 && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", color: COLOR.gris, cursor: "pointer", minHeight: "36px" }}>
                    <input
                      type="checkbox"
                      checked={seleccionados.length === pedidosPendientes.length && pedidosPendientes.length > 0}
                      onChange={toggleTodos}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    {seleccionados.length > 0
                      ? `${seleccionados.length} seleccionados`
                      : "Seleccionar todos los pendientes"}
                  </label>
                )
              }
            >
              <Tabla
                columnas={columnasPedidos}
                filas={pedidosVisibles}
                seleccionada={(p) => seleccionados.includes(p.id)}
                vacio={pedidos.length === 0 ? "No hay pedidos cargados" : "Ningún pedido coincide con los filtros"}
              />
            </Tarjeta>
          </>
        )}

        {vista === "listas" &&
          (listas.length === 0 ? (
            <Tarjeta>
              <Vacio>No hay listas de picking generadas</Vacio>
            </Tarjeta>
          ) : (
            listas.map((lista) => {
              const itemsLista = [...(lista.lista_picking_items || [])].sort((a, b) =>
                (a.ubicacion_codigo || "").localeCompare(b.ubicacion_codigo || ""),
              );
              const cajas = itemsLista.reduce((a, i) => a + (i.cantidad_cajas || 0), 0);
              return (
                <Tarjeta
                  key={lista.id}
                  titulo={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      {lista.bodegas?.nombre || "Bodega"}
                      {lista.estado === "asignada" ? (
                        <Pastilla texto="Asignada" bg="#E3F7EC" fg={COLOR.verdeTexto} />
                      ) : (
                        <Pastilla texto="Pendiente" bg="#EEF0F2" fg="#3A3F4B" />
                      )}
                    </span>
                  }
                  subtitulo={`${itemsLista.length} ítems · ${num(cajas)} cajas${lista.usuarios ? ` · ${lista.usuarios.nombre}` : ""}`}
                  extra={
                    lista.estado === "pendiente" && (
                      <select
                        onChange={(e) => e.target.value && asignarMontacarguistaLista(lista.id, e.target.value)}
                        defaultValue=""
                        aria-label="Asignar montacarguista"
                        style={{ ...estiloCampo, width: "auto" }}
                      >
                        <option value="">Asignar montacarguista</option>
                        {montacarguistas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    )
                  }
                >
                  <Tabla
                    columnas={[
                      {
                        titulo: "Ubicación",
                        celda: (it) => (
                          <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            <span
                              style={{
                                background: COLOR.negro,
                                color: COLOR.verde,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                ...mono,
                                fontWeight: 600,
                              }}
                            >
                              {it.ubicacion_codigo || "Sin ubic."}
                            </span>
                            {it.destino_saldos && <Pastilla texto="Saldos" bg="#FFF4D6" fg={COLOR.ambar} />}
                          </span>
                        ),
                      },
                      { titulo: "Referencia", celda: (it) => <span style={mono}>{it.referencia}</span> },
                      {
                        titulo: "Descripción",
                        celda: (it) => (
                          <span
                            title={it.descripcion}
                            style={{
                              display: "inline-block",
                              maxWidth: "320px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              verticalAlign: "bottom",
                            }}
                          >
                            {it.descripcion}
                          </span>
                        ),
                      },
                      { titulo: "Pedido", celda: (it) => <span style={{ ...mono, color: COLOR.gris }}>{it.pedidos?.numero}</span> },
                      { titulo: "Cajas", num: true, celda: (it) => num(it.cantidad_cajas) },
                    ]}
                    filas={itemsLista}
                    vacio="Lista sin ítems"
                  />
                </Tarjeta>
              );
            })
          ))}

        {vista === "preview" && (
          <Tarjeta
            titulo="Revisa los pedidos antes de importar"
            subtitulo="Al importar, el sistema genera automáticamente las listas de picking por bodega."
          >
            <Tabla
              clave="numero"
              columnas={[
                { titulo: "Pedido", celda: (p) => <span style={{ ...mono, fontWeight: 600 }}>{p.numero}</span> },
                { titulo: "Ref.", num: true, celda: (p) => num(p.items.length) },
                { titulo: "Unidades", num: true, celda: (p) => num(p.items.reduce((a, i) => a + i.cantidad, 0)) },
                {
                  titulo: "Referencias",
                  celda: (p) => (
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end" }}>
                      {p.items.slice(0, 5).map((it, i) => (
                        <span
                          key={i}
                          style={{
                            background: COLOR.bordeSuave,
                            color: COLOR.gris,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            ...mono,
                          }}
                        >
                          {it.referencia}
                        </span>
                      ))}
                      {p.items.length > 5 && (
                        <span style={{ fontSize: "12px", color: COLOR.gris }}>+{p.items.length - 5} más</span>
                      )}
                    </span>
                  ),
                },
              ]}
              filas={previaCsv}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
              <Boton onClick={volverALista}>Cancelar</Boton>
              <Boton variante="verde" onClick={importarPedidos} disabled={cargando}>
                {cargando ? "Importando y generando listas..." : `Importar ${previaCsv.length} pedidos y generar listas →`}
              </Boton>
            </div>
          </Tarjeta>
        )}

        {vista === "asignar" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", alignItems: "start" }}>
            <Tarjeta titulo="Pedidos a asignar" subtitulo="Todos se asignan al mismo operario.">
              <Tabla
                columnas={[
                  { titulo: "Pedido", celda: (p) => <span style={{ ...mono, fontWeight: 600 }}>{p.numero}</span> },
                  {
                    titulo: "Prioridad",
                    celda: (p) => {
                      const pr = prioridadColor[p.prioridad] || prioridadColor.normal;
                      return <Pastilla texto={pr.label} bg={pr.bg} fg={pr.color} />;
                    },
                  },
                  { titulo: "Ref.", num: true, celda: (p) => num(p.pedido_items?.length || 0) },
                  { titulo: "Unidades", num: true, celda: (p) => num(unidades(p)) },
                ]}
                filas={seleccionados.map((id) => pedidos.find((p) => p.id === id)).filter(Boolean)}
              />
            </Tarjeta>

            <Tarjeta titulo="Asignación" style={{ position: "sticky", top: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Campo etiqueta="Operario para todos los pedidos *">
                  <select value={operarioTanda} onChange={(e) => setOperarioTanda(e.target.value)} style={estiloCampo}>
                    <option value="">Selecciona un operario</option>
                    {operarios.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "4px" }}>Montacarguistas por bodega</div>
                {bodegas
                  .filter((b) => b.codigo !== "SALDOS")
                  .map((bodega) => (
                    <Campo key={bodega.id} etiqueta={bodega.nombre}>
                      <select
                        value={montacarguistasPorBodega[bodega.id] || ""}
                        onChange={(e) =>
                          setMontacarguistasPorBodega((prev) => ({
                            ...prev,
                            [bodega.id]: e.target.value,
                          }))
                        }
                        style={estiloCampo}
                      >
                        <option value="">Sin asignar</option>
                        {montacarguistas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  ))}
                <Boton variante="verde" onClick={asignarTanda} disabled={cargando} style={{ width: "100%", marginTop: "6px" }}>
                  {cargando ? "Asignando..." : "Confirmar asignación →"}
                </Boton>
              </div>
            </Tarjeta>
          </div>
        )}
      </Pagina>

      {modalCancelar && (
        <Modal
          titulo="Cancelar pedido"
          subtitulo={`Pedido ${modalCancelar.numero} — estado: ${estadoDe(modalCancelar.estado).label}`}
          onCerrar={() => {
            setModalCancelar(null);
            setMotivoCancelacion("");
          }}
          acciones={
            <>
              <Boton
                onClick={() => {
                  setModalCancelar(null);
                  setMotivoCancelacion("");
                }}
              >
                Volver
              </Boton>
              <Boton variante="peligroLleno" onClick={cancelarPedido} disabled={cargando || !motivoCancelacion.trim()}>
                Confirmar cancelación
              </Boton>
            </>
          }
        >
          <Campo etiqueta="Motivo de cancelación *">
            <input
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              placeholder="Ej: el cliente canceló el pedido"
              style={estiloCampo}
              autoFocus
            />
          </Campo>
        </Modal>
      )}
    </Layout>
  );
}
