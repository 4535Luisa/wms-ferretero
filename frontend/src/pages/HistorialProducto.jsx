import { useState } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Pagina,
  Boton,
  Tarjeta,
  FilaKpis,
  Kpi,
  Filtros,
  Campo,
  Mensaje,
  Tabla,
  Pastilla,
} from "../components/oficina";
import { estiloCampo, COLOR, movimiento, cantidadesMovimiento as cantidades } from "../components/oficinaDatos";
import { num } from "../components/panel/formato";

const fecha = (iso) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
        `/api/productos/buscar?referencia=${encodeURIComponent(referencia.trim())}`,
      );
      if (!producto) {
        setError(`Referencia ${referencia} no encontrada`);
        return;
      }
      const { data } = await api.get(`/api/productos/${producto.id}/historial`);
      setResultado({ ...data, producto: data.producto || producto });
    } catch (err) {
      setError(
        err.response?.status === 404
          ? `Referencia ${referencia} no encontrada`
          : "Error al buscar el producto",
      );
    } finally {
      setCargando(false);
    }
  };

  const inventario = resultado?.inventario || [];
  const movimientos = resultado?.movimientos || [];
  const bodegaPorId = Object.fromEntries(
    inventario.filter((i) => i.bodegas).map((i) => [i.bodega_id, i.bodegas.nombre]),
  );
  const disponible = inventario.reduce((a, i) => a + (i.cantidad_disponible || 0), 0);
  const comprometido = inventario.reduce((a, i) => a + (i.cantidad_comprometida || 0), 0);

  const columnasStock = [
    { titulo: "Bodega", celda: (i) => i.bodegas?.nombre || "—" },
    {
      titulo: "Ubicación",
      celda: (i) => (
        <span style={{ fontFamily: "DM Mono, monospace" }}>{i.ubicaciones?.codigo || "Sin ubicación"}</span>
      ),
    },
    { titulo: "Disponible", num: true, celda: (i) => num(i.cantidad_disponible) },
    { titulo: "Comprometido", num: true, celda: (i) => num(i.cantidad_comprometida) },
  ];

  const columnasMov = [
    {
      titulo: "Fecha",
      celda: (m) => (
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: "13px", color: COLOR.gris, whiteSpace: "nowrap" }}>
          {fecha(m.created_at)}
        </span>
      ),
    },
    {
      titulo: "Movimiento",
      celda: (m) => {
        const t = movimiento(m.accion);
        return <Pastilla texto={t.label} bg={t.bg} fg={t.color} />;
      },
    },
    {
      titulo: "Detalle",
      celda: (m) => {
        const v = m.valores_despues || {};
        const partes = [
          v.proveedor,
          v.factura && `Fact. ${v.factura}`,
          bodegaPorId[v.bodega_id],
          v.tipo,
        ].filter(Boolean);
        return <span style={{ color: COLOR.gris }}>{partes.join(" · ") || "—"}</span>;
      },
    },
    { titulo: "Usuario", celda: (m) => m.usuarios?.nombre || "—" },
    {
      titulo: "Antes",
      num: true,
      celda: (m) => num(cantidades(m).antes),
    },
    {
      titulo: "Después",
      num: true,
      celda: (m) => {
        const c = cantidades(m);
        return (
          <span>
            {num(c.despues)}
            {c.comprometida && (
              <span style={{ fontSize: "11px", color: COLOR.gris, marginLeft: "4px" }}>compr.</span>
            )}
          </span>
        );
      },
    },
    {
      titulo: "Cambio",
      num: true,
      celda: (m) => {
        const { antes, despues } = cantidades(m);
        if (antes == null || despues == null) return "—";
        const d = Number(despues) - Number(antes);
        return (
          <span style={{ fontWeight: 600, color: d > 0 ? COLOR.verdeTexto : d < 0 ? COLOR.rojo : COLOR.gris }}>
            {d > 0 ? "+" : ""}
            {num(d)}
          </span>
        );
      },
    },
  ];

  return (
    <Layout titulo="Historial de producto" subtitulo="Trazabilidad completa por referencia">
      <Pagina>
        <Filtros>
          <Campo etiqueta="Referencia del producto" ancho="260px">
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscar();
              }}
              placeholder="Ej: 120212"
              style={{ ...estiloCampo, fontFamily: "DM Mono, monospace", fontSize: "16px" }}
              autoFocus
            />
          </Campo>
          <Boton variante="principal" onClick={buscar} disabled={cargando}>
            {cargando ? "Buscando..." : "Buscar"}
          </Boton>
        </Filtros>

        <Mensaje tipo="error">{error}</Mensaje>

        {resultado && (
          <>
            <Tarjeta
              titulo={resultado.producto.descripcion_corta}
              subtitulo={`Ref. ${resultado.producto.codigo_interno} · Unidad de empaque: ${resultado.producto.unidad_empaque || "no definida"}`}
              style={{ paddingBottom: "8px" }}
            />

            <FilaKpis etiqueta="Resumen del producto">
              <Kpi etiqueta="Disponible" valor={num(disponible)} pie="unidades en todas las bodegas" />
              <Kpi etiqueta="Comprometido" valor={num(comprometido)} pie="reservado para pedidos" />
              <Kpi etiqueta="Ubicaciones" valor={inventario.length} />
              <Kpi etiqueta="Movimientos" valor={movimientos.length} pie={movimientos.length >= 100 ? "últimos 100" : undefined} />
            </FilaKpis>

            <Tarjeta titulo="Stock actual por bodega">
              <Tabla columnas={columnasStock} filas={inventario} vacio="Este producto no tiene inventario registrado" />
            </Tarjeta>

            <Tarjeta titulo="Historial de movimientos" subtitulo="Del más reciente al más antiguo">
              <Tabla columnas={columnasMov} filas={movimientos} vacio="No hay movimientos registrados para este producto" />
            </Tarjeta>
          </>
        )}
      </Pagina>
    </Layout>
  );
}
