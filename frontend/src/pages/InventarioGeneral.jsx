import { useState, useEffect, useRef, useCallback } from "react";
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
  Tabla,
  Vacio,
  Pastilla,
  Nota,
} from "../components/oficina";
import { estiloCampo, COLOR, movimiento, cantidadesMovimiento } from "../components/oficinaDatos";
import { num } from "../components/panel/formato";

const FILAS_POR_PAGINA = 300;
const COLOR_COMPROMETIDO = "#993C1D";

const mono = { fontFamily: "DM Mono, monospace" };

export default function InventarioGeneral() {
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({
    referencia: "",
    descripcion: "",
    bodega: "",
  });
  const [limite, setLimite] = useState(FILAS_POR_PAGINA);
  const [panelRef, setPanelRef] = useState(null); // fila seleccionada para el detalle
  const [panelData, setPanelData] = useState(null); // { producto, movimientos, inventario }
  const [cargandoPanel, setCargandoPanel] = useState(false);
  const [pestanaPanel, setPestanaPanel] = useState("ubicaciones"); // "ubicaciones" | "pedidos" | "movimientos"
  const panelRef2 = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get(
        `/api/productos/inventario-general?_t=${Date.now()}`,
      );
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

  const cerrarPanel = () => {
    setPanelRef(null);
    setPanelData(null);
  };

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === "Escape") cerrarPanel();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
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

  const inventarioPorProducto = panelData?.inventario || [];
  const totalDisponibleProd = inventarioPorProducto.reduce(
    (a, r) => a + (r.cantidad_disponible || 0),
    0,
  );
  const totalCompProd = inventarioPorProducto.reduce(
    (a, r) => a + (r.cantidad_comprometida || 0),
    0,
  );

  const bodegas = [...new Set(inventario.map((r) => r.bodega).filter(Boolean))].sort();

  const filtrado = inventario.filter((r) => {
    const ref = filtros.referencia.toLowerCase();
    const desc = filtros.descripcion.toLowerCase();
    return (
      (!ref || (r.referencia || "").toLowerCase().includes(ref)) &&
      (!desc || (r.descripcion || "").toLowerCase().includes(desc)) &&
      (!filtros.bodega || r.bodega === filtros.bodega)
    );
  });

  const totalDisp = filtrado.reduce((a, r) => a + (r.cantidad_disponible || 0), 0);
  const totalComp = filtrado.reduce((a, r) => a + (r.cantidad_comprometida || 0), 0);

  const cambiarFiltro = (key, valor) => {
    setFiltros((f) => ({ ...f, [key]: valor }));
    setLimite(FILAS_POR_PAGINA);
  };

  const columnas = [
    {
      titulo: "Referencia",
      celda: (r) => <span style={{ ...mono, fontWeight: 600, whiteSpace: "nowrap" }}>{r.referencia}</span>,
    },
    {
      titulo: "Descripción",
      celda: (r) => (
        <span
          title={r.descripcion}
          style={{
            display: "inline-block",
            maxWidth: "320px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "bottom",
          }}
        >
          {r.descripcion}
        </span>
      ),
    },
    {
      titulo: "Bodega",
      celda: (r) => <Pastilla texto={r.bodega || "—"} bg="#EEF0F2" fg="#3A3F4B" />,
    },
    {
      titulo: "Ubicación",
      celda: (r) => <span style={{ ...mono, fontSize: "13px", color: COLOR.gris }}>{r.ubicacion || "—"}</span>,
    },
    { titulo: "Disponible", num: true, celda: (r) => num(r.cantidad_disponible || 0) },
    {
      titulo: "Comprometido",
      num: true,
      celda: (r) => (
        <span style={{ color: r.cantidad_comprometida > 0 ? COLOR_COMPROMETIDO : COLOR.gris }}>
          {num(r.cantidad_comprometida || 0)}
        </span>
      ),
    },
    {
      titulo: "Real",
      num: true,
      celda: (r) => {
        const real = (r.cantidad_disponible || 0) - (r.cantidad_comprometida || 0);
        return <span style={{ fontWeight: 600, color: real < 0 ? COLOR.rojo : COLOR.negro }}>{num(real)}</span>;
      },
    },
  ];

  return (
    <Layout titulo="Inventario General" subtitulo={`${filtrado.length} registros`}>
      <Pagina>
        <FilaKpis etiqueta="Totales del inventario filtrado">
          <Kpi etiqueta="Registros" valor={num(filtrado.length)} />
          <Kpi etiqueta="Total disponible" valor={num(totalDisp)} />
          <Kpi etiqueta="Total comprometido" valor={num(totalComp)} colorValor={totalComp > 0 ? COLOR_COMPROMETIDO : undefined} />
          <Kpi
            etiqueta="Disponible real"
            valor={num(totalDisp - totalComp)}
            pie="disponible menos comprometido"
            colorValor={totalDisp - totalComp < 0 ? COLOR.rojo : undefined}
          />
        </FilaKpis>

        <Filtros>
          <Campo etiqueta="Referencia" ancho="160px">
            <input
              value={filtros.referencia}
              onChange={(e) => cambiarFiltro("referencia", e.target.value)}
              placeholder="Ej: 120212"
              style={{ ...estiloCampo, ...mono }}
            />
          </Campo>
          <Campo etiqueta="Descripción" ancho="220px">
            <input
              value={filtros.descripcion}
              onChange={(e) => cambiarFiltro("descripcion", e.target.value)}
              placeholder="Ej: tornillo"
              style={estiloCampo}
            />
          </Campo>
          <Campo etiqueta="Bodega" ancho="160px">
            <select value={filtros.bodega} onChange={(e) => cambiarFiltro("bodega", e.target.value)} style={estiloCampo}>
              <option value="">Todas</option>
              {bodegas.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Campo>
          <Boton
            onClick={() => {
              setFiltros({ referencia: "", descripcion: "", bodega: "" });
              setLimite(FILAS_POR_PAGINA);
            }}
          >
            Limpiar
          </Boton>
          <Boton variante="principal" onClick={cargar}>
            ↻ Actualizar
          </Boton>
        </Filtros>

        <Tarjeta
          titulo="Existencias por ubicación"
          subtitulo="Toca una fila para ver todas sus ubicaciones, lo comprometido y los movimientos."
        >
          {cargando ? (
            <Vacio>Cargando inventario...</Vacio>
          ) : (
            <>
              <Tabla
                columnas={columnas}
                filas={filtrado.slice(0, limite)}
                clave={(r, i) => `${r.producto_id}-${r.bodega}-${r.ubicacion || i}`}
                alClic={abrirPanel}
                seleccionada={(r) => panelRef?.producto_id === r.producto_id}
              />
              {filtrado.length > limite && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
                  <Nota style={{ margin: 0 }}>
                    Se muestran {num(limite)} de {num(filtrado.length)}. Usa los filtros para acotar.
                  </Nota>
                  <Boton pequeno onClick={() => setLimite((l) => l + FILAS_POR_PAGINA)}>
                    Mostrar más
                  </Boton>
                </div>
              )}
            </>
          )}
        </Tarjeta>
      </Pagina>

      {panelRef && (
        <>
          <div
            aria-hidden="true"
            onClick={cerrarPanel}
            style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.35)", zIndex: 400 }}
          />
          <aside
            ref={panelRef2}
            role="dialog"
            aria-label={`Detalle de ${panelRef.referencia}`}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100vw)",
              background: "#FFFFFF",
              zIndex: 401,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                background: COLOR.negro,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLOR.verde, fontWeight: 600, ...mono, fontSize: "16px" }}>{panelRef.referencia}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", marginTop: "4px" }}>{panelRef.descripcion}</div>
              </div>
              <button
                type="button"
                onClick={cerrarPanel}
                aria-label="Cerrar detalle"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#FFFFFF",
                  cursor: "pointer",
                  fontSize: "24px",
                  lineHeight: 1,
                  minWidth: "44px",
                  minHeight: "44px",
                }}
              >
                ×
              </button>
            </div>

            {!cargandoPanel && panelData && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: `1px solid ${COLOR.borde}` }}>
                {[
                  { label: "Disponible", valor: totalDisponibleProd, color: COLOR.negro },
                  { label: "Comprometido", valor: totalCompProd, color: COLOR_COMPROMETIDO },
                  { label: "Real", valor: totalDisponibleProd - totalCompProd, color: COLOR.negro },
                ].map(({ label, valor, color }) => (
                  <div key={label} style={{ padding: "14px 12px", textAlign: "center", borderRight: `1px solid ${COLOR.bordeSuave}` }}>
                    <div style={{ fontSize: "12px", color: COLOR.gris }}>{label}</div>
                    <div style={{ fontSize: "22px", fontWeight: 500, ...mono, color }}>{num(valor)}</div>
                  </div>
                ))}
              </div>
            )}

            <div role="tablist" style={{ display: "flex", borderBottom: `1px solid ${COLOR.borde}` }}>
              {[
                ["ubicaciones", "Ubicaciones"],
                ["pedidos", "Comprometido"],
                ["movimientos", "Movimientos"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={pestanaPanel === tab}
                  onClick={() => setPestanaPanel(tab)}
                  style={{
                    flex: 1,
                    padding: "12px 4px",
                    minHeight: "44px",
                    border: "none",
                    background: "transparent",
                    font: "inherit",
                    fontSize: "14px",
                    fontWeight: pestanaPanel === tab ? 600 : 500,
                    color: pestanaPanel === tab ? COLOR.negro : COLOR.gris,
                    cursor: "pointer",
                    borderBottom: pestanaPanel === tab ? `2px solid ${COLOR.negro}` : "2px solid transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {cargandoPanel ? (
                <Vacio>Cargando...</Vacio>
              ) : !panelData ? null : pestanaPanel === "ubicaciones" ? (
                inventarioPorProducto.length === 0 ? (
                  <Vacio>Sin stock en bodega</Vacio>
                ) : (
                  inventarioPorProducto.map((inv, i) => (
                    <FilaDetalle
                      key={inv.id || i}
                      titulo={inv.ubicaciones?.codigo || "Sin ubicación"}
                      tituloMono
                      sub={inv.bodegas?.nombre || inv.bodegas?.codigo}
                      valor={num(inv.cantidad_disponible || 0)}
                      nota={inv.cantidad_comprometida > 0 ? `−${num(inv.cantidad_comprometida)} compr.` : null}
                    />
                  ))
                )
              ) : pestanaPanel === "pedidos" ? (
                inventarioPorProducto.every((r) => !r.cantidad_comprometida) ? (
                  <Vacio>Sin stock comprometido</Vacio>
                ) : (
                  inventarioPorProducto
                    .filter((r) => r.cantidad_comprometida > 0)
                    .map((inv, i) => (
                      <FilaDetalle
                        key={inv.id || i}
                        titulo={inv.ubicaciones?.codigo || "Sin ubicación"}
                        tituloMono
                        sub={inv.bodegas?.nombre || inv.bodegas?.codigo}
                        valor={num(inv.cantidad_comprometida)}
                        colorValor={COLOR_COMPROMETIDO}
                        nota="comprometidas"
                      />
                    ))
                )
              ) : (panelData.movimientos || []).length === 0 ? (
                <Vacio>Sin movimientos registrados</Vacio>
              ) : (
                panelData.movimientos.map((m, i) => {
                  const { antes, despues } = cantidadesMovimiento(m);
                  const diff = antes != null && despues != null ? despues - antes : null;
                  const t = movimiento(m.accion);
                  return (
                    <FilaDetalle
                      key={m.id || i}
                      titulo={<Pastilla texto={t.label} bg={t.bg} fg={t.color} />}
                      sub={
                        new Date(m.created_at).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }) + (m.usuarios?.nombre ? ` · ${m.usuarios.nombre}` : "")
                      }
                      valor={diff === null ? "—" : `${diff >= 0 ? "+" : ""}${num(diff)}`}
                      colorValor={diff === null ? COLOR.gris : diff >= 0 ? COLOR.verdeTexto : COLOR.rojo}
                    />
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}
    </Layout>
  );
}

function FilaDetalle({ titulo, tituloMono, sub, valor, colorValor = COLOR.negro, nota }) {
  return (
    <div
      style={{
        padding: "12px 20px",
        borderBottom: `1px solid ${COLOR.bordeSuave}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "14px", ...(tituloMono ? mono : {}) }}>{titulo}</div>
        {sub && <div style={{ fontSize: "12px", color: COLOR.gris, marginTop: "4px" }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ ...mono, fontWeight: 600, fontSize: "15px", color: colorValor }}>{valor}</div>
        {nota && <div style={{ fontSize: "12px", color: COLOR_COMPROMETIDO }}>{nota}</div>}
      </div>
    </div>
  );
}
