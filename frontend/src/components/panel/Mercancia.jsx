import { useEffect, useState } from "react";
import api from "../../services/api";
import {
  Aviso,
  BarraFiltros,
  BotonPequeno,
  FilaKpis,
  Kpi,
  Nota,
  Pastilla,
  Selector,
  SelectorPeriodo,
  Tarjeta,
} from "./ui";
import {
  descargarExcel,
  imprimir,
  paramsPeriodo,
  useDatosPanel,
  useTip,
} from "./herramientas";
import { COLOR, num, textoRango } from "./formato";

const SITUACION = {
  agotada: { texto: "Agotada en picking", bg: "#FDECEC", fg: COLOR.rojo },
  sin: { texto: "Sin pedidos 90 d", bg: "#EEF0F2", fg: COLOR.gris },
};
const FILAS_VISIBLES = 12;

const pctDe = (parte, total) => (total > 0 ? (100 * parte) / total : 0);

export default function Mercancia({ fijo, onCargado }) {
  const [periodo, setPeriodo] = useState(fijo || { periodo: "30d" });
  const [bodega, setBodega] = useState("");
  const [familia, setFamilia] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const params = { ...paramsPeriodo(periodo), ...(bodega && { bodega }), ...(familia && { familia }) };
  const { datos: resp, error } = useDatosPanel("/api/panel/mercancia", params, { activo: !periodo.pendiente });
  const [tipProps, tip] = useTip();

  useEffect(() => {
    if (resp && onCargado) onCargado();
  }, [resp, onCargado]);

  if (!resp) return <Aviso tipo={error ? "error" : "info"}>{error || "Cargando…"}</Aviso>;

  const d = resp.datos || {};
  const bodegaCodigo = resp.bodegas.find((b) => b.id === bodega)?.codigo;
  const situaciones = [
    ...(d.agotadas || []).map((a) => ({ ...a, bodega: "B8 / B36 / B7", stock: 0, sit: "agotada" })),
    ...(d.sin_movimiento || []).map((s) => ({ ...s, sit: "sin" })),
  ];
  const visibles = verTodo || fijo ? situaciones : situaciones.slice(0, FILAS_VISIBLES);
  const totalRefs = d.refs_activas || 0;
  const desp = d.despachado_total || 0;
  const maxBodega = Math.max(1, ...(d.stock_bodegas || []).map((b) => b.unidades));
  const maxTop = Math.max(1, ...(d.top || []).map((t) => t.unidades));
  const sufijo = `${resp.desde.slice(0, 10)}_${resp.hasta.slice(0, 10)}`;

  const filasSituacion = () =>
    situaciones.map((s) => ({
      Referencia: s.referencia,
      Descripción: s.descripcion,
      Bodega: s.bodega,
      Stock: s.stock,
      Situación: SITUACION[s.sit].texto,
      "Pedidos en el periodo": s.pedidos ?? null,
    }));

  const traerAjustes = async () => {
    const { data } = await api.get("/api/panel/ajustes", {
      params: { ...paramsPeriodo(periodo), ...(bodega && { bodega }) },
    });
    return data.filas.map((a) => ({
      Fecha: new Date(a.fecha).toLocaleString("es-CO", { timeZone: resp.zona_horaria }),
      Referencia: a.referencia,
      Descripción: a.descripcion,
      Bodega: a.bodega,
      Tipo: a.tipo,
      Unidades: a.unidades,
      Motivo: a.motivo,
    }));
  };

  const excel = async () => {
    setDescargando(true);
    try {
      await descargarExcel(`inventario_rotacion_${sufijo}.xlsx`, [
        {
          nombre: "Resumen",
          filas: [
            { Indicador: "Referencias activas", Valor: d.refs_activas },
            { Indicador: "Unidades en stock", Valor: d.unidades_stock },
            { Indicador: "Agotadas en picking", Valor: d.agotadas_total },
            { Indicador: "Sin pedidos en 90 días (con stock)", Valor: d.sin_movimiento_total },
            { Indicador: "Unidades despachadas en el periodo", Valor: d.despachado_total },
            { Indicador: "Bodega", Valor: bodegaCodigo || "Todas" },
            { Indicador: "Familia", Valor: familia || "Todas" },
          ],
        },
        { nombre: "Stock por bodega", filas: (d.stock_bodegas || []).map((b) => ({ Bodega: b.codigo, Unidades: b.unidades })) },
        { nombre: "Más despachadas", filas: (d.top || []).map((t, i) => ({ Puesto: i + 1, Referencia: t.referencia, Descripción: t.descripcion, Unidades: t.unidades })) },
        {
          nombre: "ABC",
          filas: ["A", "B", "C"].map((c) => ({
            Clase: c,
            Referencias: d.abc?.[c]?.refs,
            "% referencias": Number(pctDe(d.abc?.[c]?.refs || 0, totalRefs).toFixed(1)),
            "% del despacho": Number(pctDe(d.abc?.[c]?.unidades || 0, desp).toFixed(1)),
          })),
        },
        { nombre: "Agotadas y sin movimiento", filas: filasSituacion() },
        { nombre: "Ajustes aprobados", filas: await traerAjustes() },
      ]);
    } finally {
      setDescargando(false);
    }
  };

  const ajustes = d.ajustes || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {tip}
      {!fijo && (
        <BarraFiltros onExcel={excel} ocupado={descargando} onPdf={() => imprimir(`Panel mercancia - ${textoRango(resp)}`)}>
          <SelectorPeriodo id="m-periodo" periodos={["30d", "semana", "mes", "personalizado"]} valor={periodo} onChange={setPeriodo} />
          <Selector
            id="m-bodega"
            etiqueta="Bodega"
            valor={bodega}
            onChange={setBodega}
            minWidth={130}
            opciones={[{ valor: "", texto: "Todas" }, ...resp.bodegas.map((b) => ({ valor: b.id, texto: b.codigo }))]}
          />
          <Selector
            id="m-familia"
            etiqueta="Familia"
            valor={familia}
            onChange={setFamilia}
            opciones={[{ valor: "", texto: "Todas" }, ...(d.familias || []).map((f) => ({ valor: f, texto: f }))]}
          />
        </BarraFiltros>
      )}

      <FilaKpis etiqueta="Indicadores de mercancía">
        <Kpi etiqueta="Referencias activas" valor={num(d.refs_activas)} pie={`+${num(d.refs_nuevas)} creadas en el periodo`} />
        <Kpi etiqueta={`Unidades en stock${bodegaCodigo ? ` · ${bodegaCodigo}` : ""}`} valor={num(d.unidades_stock)} pie={`En ${num(d.refs_con_stock)} referencias`} />
        <Kpi
          etiqueta="Agotadas en picking"
          valor={num(d.agotadas_total)}
          colorValor={d.agotadas_total > 0 ? COLOR.rojo : undefined}
          pie="Con pedidos y 0 unidades en B8, B36 y B7"
        />
        <Kpi etiqueta="Sin pedidos en 90 días" valor={num(d.sin_movimiento_total)} pie="Referencias con stock disponible" />
      </FilaKpis>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
        <Tarjeta id="bodegas" titulo="Stock por bodega (unidades)" style={{ flex: "1 1 420px" }}>
          {(d.stock_bodegas || []).length === 0 ? (
            <Nota style={{ margin: 0 }}>Sin stock.</Nota>
          ) : (
            <>
              <div
                role="img"
                aria-label={`Unidades en stock por bodega: ${d.stock_bodegas.map((b) => `${b.codigo} ${num(b.unidades)}`).join(", ")}`}
                style={{ display: "grid", gridTemplateColumns: `repeat(${d.stock_bodegas.length}, minmax(0, 1fr))`, gap: "20px", alignItems: "end", height: "220px", borderBottom: "1px solid #C9CDD4" }}
              >
                {d.stock_bodegas.map((b) => (
                  <div key={b.codigo} {...tipProps(`${b.codigo}: ${num(b.unidades)} unidades`)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "6px", height: "100%", outline: "none" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>{num(b.unidades)}</span>
                    <div style={{ width: "100%", maxWidth: "72px", height: `${(b.unidades / maxBodega) * 88}%`, minHeight: b.unidades > 0 ? "2px" : 0, background: COLOR.negro, borderRadius: "4px 4px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.stock_bodegas.length}, minmax(0, 1fr))`, gap: "20px", marginTop: "8px" }}>
                {d.stock_bodegas.map((b) => (
                  <span key={b.codigo} style={{ textAlign: "center", fontSize: "14px", fontWeight: 600 }}>{b.codigo}</span>
                ))}
              </div>
            </>
          )}
        </Tarjeta>

        <Tarjeta id="top" titulo="Referencias más despachadas" style={{ flex: "999 1 560px" }} extra={<span style={{ fontSize: "13px", color: COLOR.gris }}>Unidades de pedidos facturados en el periodo</span>}>
          {(d.top || []).length === 0 ? (
            <Nota style={{ margin: 0 }}>Sin pedidos facturados en el periodo.</Nota>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {d.top.map((t, i) => (
                <div key={t.referencia} {...tipProps(`${t.referencia} · ${t.descripcion || ""}\n${num(t.unidades)} unidades`)} style={{ display: "grid", gridTemplateColumns: "24px minmax(80px, 120px) minmax(0, 1fr) 64px", alignItems: "center", gap: "10px", fontSize: "14px", outline: "none" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: COLOR.gris }}>{i + 1}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.descripcion}>{t.referencia}</span>
                  <div style={{ height: "16px", background: COLOR.bordeSuave, borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(t.unidades / maxTop) * 100}%`, background: COLOR.verdeBarra, borderRadius: "4px" }} />
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{num(t.unidades)}</span>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>

      <Tarjeta id="abc" titulo="Clasificación ABC por despacho" extra={<span style={{ fontSize: "13px", color: COLOR.gris }}>Para ubicar las referencias A en las posiciones más cercanas</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          {[
            { c: "A", desc: "Alta rotación", bg: COLOR.verde, fg: COLOR.negro },
            { c: "B", desc: "Rotación media", bg: COLOR.negro, fg: "#FFFFFF" },
            { c: "C", desc: "Baja rotación o sin despacho", bg: COLOR.borde, fg: COLOR.negro },
          ].map(({ c, desc, bg, fg }) => (
            <div key={c} style={{ border: `1px solid ${COLOR.borde}`, borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "30px", width: "40px", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", background: bg, color: fg }}>{c}</span>
                <span style={{ fontSize: "14px", color: COLOR.gris }}>{desc}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: COLOR.gris }}>Referencias</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "22px" }}>
                    {num(d.abc?.[c]?.refs)} ({num(pctDe(d.abc?.[c]?.refs || 0, totalRefs))} %)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: COLOR.gris }}>Del despacho</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "22px" }}>{num(pctDe(d.abc?.[c]?.unidades || 0, desp))} %</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Nota>A: referencias que suman el primer 70 % de las unidades despachadas; B: el siguiente 20 %; C: el resto y las que no tuvieron despacho. Solo informativa: no cambia la clasificación guardada en productos.</Nota>
      </Tarjeta>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
        <Tarjeta
          id="sinmov"
          titulo="Agotadas y sin movimiento"
          style={{ flex: "1 1 520px" }}
          extra={<BotonPequeno onClick={() => descargarExcel(`agotadas_sin_movimiento_${sufijo}.xlsx`, [{ nombre: "Referencias", filas: filasSituacion() }])}>Descargar</BotonPequeno>}
        >
          {situaciones.length === 0 ? (
            <Nota style={{ margin: 0 }}>No hay referencias agotadas en picking ni sin pedidos en 90 días.</Nota>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "520px" }}>
                <thead>
                  <tr style={{ color: COLOR.gris, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left" }}>
                    <th scope="col" style={th}>Referencia</th>
                    <th scope="col" style={th}>Bodega</th>
                    <th scope="col" style={{ ...th, textAlign: "right" }}>Stock</th>
                    <th scope="col" style={th}>Situación</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((s) => (
                    <tr key={`${s.sit}-${s.referencia}`}>
                      <td style={td}>
                        <div style={{ fontFamily: "'DM Mono', monospace" }}>{s.referencia}</div>
                        <div style={{ fontSize: "12px", color: COLOR.gris }}>{s.descripcion}</div>
                      </td>
                      <td style={td}>{s.bodega || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{num(s.stock)}</td>
                      <td style={td}><Pastilla {...SITUACION[s.sit]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!fijo && situaciones.length > FILAS_VISIBLES && (
            <div style={{ marginTop: "12px" }}>
              <BotonPequeno onClick={() => setVerTodo((v) => !v)}>
                {verTodo ? "Ver menos" : `Ver las ${num(situaciones.length)}`}
              </BotonPequeno>
            </div>
          )}
          <Nota>
            Agotada en picking: tuvo pedidos en el periodo y no tiene unidades disponibles en B8, B36 ni B7. Sin pedidos
            90 d: tiene stock y ningún pedido en los últimos 90 días.
            {(d.agotadas_total > d.agotadas?.length || d.sin_movimiento_total > d.sin_movimiento?.length) &&
              " La tabla y la descarga muestran hasta 300 de cada tipo."}
          </Nota>
        </Tarjeta>

        <Tarjeta id="ajustes" titulo="Ajustes y diferencias de conteo" style={{ flex: "1 1 520px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "16px" }}>
            {[
              ["Ajustes aprobados", num(ajustes.aprobados), COLOR.negro],
              ["Unidades faltantes", ajustes.faltantes ? `−${num(ajustes.faltantes)}` : "0", COLOR.rojo],
              ["Unidades sobrantes", ajustes.sobrantes ? `+${num(ajustes.sobrantes)}` : "0", COLOR.verdeTexto],
            ].map(([t, v, c]) => (
              <div key={t} style={{ background: "#F7F8F9", borderRadius: "10px", padding: "12px" }}>
                <div style={{ fontSize: "12px", color: COLOR.gris }}>{t}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "22px", color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: COLOR.gris, marginBottom: "8px" }}>Referencias con más ajustes</div>
          {(ajustes.top || []).length === 0 ? (
            <Nota style={{ margin: 0 }}>Sin ajustes aprobados en el periodo.</Nota>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {ajustes.top.map((a) => (
                <div key={a.referencia} style={{ display: "grid", gridTemplateColumns: "minmax(70px, 100px) minmax(0, 1fr) 56px", gap: "10px", alignItems: "center", fontSize: "14px" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>{a.referencia}</span>
                  <span style={{ color: COLOR.gris }}>
                    {a.tipos} ({a.ajustes} {a.ajustes === 1 ? "vez" : "veces"})
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", textAlign: "right", color: a.neto < 0 ? COLOR.rojo : COLOR.verdeTexto }}>
                    {a.neto > 0 ? "+" : a.neto < 0 ? "−" : ""}
                    {num(Math.abs(a.neto))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Nota>Incluye los ajustes que vienen de conteos.</Nota>
        </Tarjeta>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: `1px solid ${COLOR.borde}` };
const td = { padding: "10px", borderBottom: `1px solid ${COLOR.bordeSuave}` };
