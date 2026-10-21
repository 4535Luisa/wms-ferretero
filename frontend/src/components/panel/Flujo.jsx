import { useEffect, useState } from "react";
import {
  Aviso,
  BarraFiltros,
  Leyenda,
  Nota,
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
import { COLOR, diaCorto, duracion, num, pct, textoRango } from "./formato";

const ETAPAS = [
  ["cargados", "Cargados"],
  ["asignados", "Asignados"],
  ["alistados", "Alistados"],
  ["verificados", "Verificados"],
  ["facturados", "Facturados"],
];

const TRAMOS = [
  ["carga_asignacion", "Carga → asignación"],
  ["asignacion_cierre", "Asignación → cierre del operario"],
  ["cierre_verificacion", "Cierre → verificación"],
  ["verificacion_factura", "Verificación → factura"],
];

const errPct = (b) => (b.escaneos > 0 ? (100 * b.errores) / b.escaneos : null);

export default function Flujo({ fijo, onCargado }) {
  const [periodo, setPeriodo] = useState(fijo || { periodo: "14d" });
  const [prioridad, setPrioridad] = useState("");
  const params = { ...paramsPeriodo(periodo), ...(prioridad && { prioridad }) };
  const { datos: resp, error } = useDatosPanel("/api/panel/flujo", params, { activo: !periodo.pendiente });
  const [tipProps, tip] = useTip();

  useEffect(() => {
    if (resp && onCargado) onCargado();
  }, [resp, onCargado]);

  if (!resp) return <Aviso tipo={error ? "error" : "info"}>{error || "Cargando…"}</Aviso>;

  const d = resp.datos || {};
  const emb = d.embudo || {};
  const max = Math.max(1, emb.cargados || 0);
  const tramos = TRAMOS.map(([k, t]) => ({ k, t, min: d.tramos?.[k] }));
  const maxTramo = Math.max(1, ...tramos.map((t) => t.min || 0));
  const cuello = tramos.reduce((a, b) => ((b.min || 0) > (a?.min || 0) ? b : a), null);
  const dias = d.dias || [];
  const maxDia = Math.max(1, ...dias.map((x) => x.total));
  const totalTarde = dias.reduce((a, x) => a + x.tarde, 0);
  const totalDias = dias.reduce((a, x) => a + x.total, 0);
  const sufijo = `${resp.desde.slice(0, 10)}_${resp.hasta.slice(0, 10)}`;
  const bodegas = d.bodegas || [];
  const saldos = d.saldos || {};
  const falt = d.faltantes || {};
  // Etiquetas de días: todas si caben, si no una de cada N.
  const cadaN = Math.ceil(dias.length / 16);

  const excel = () =>
    descargarExcel(`flujo_${sufijo}.xlsx`, [
      {
        nombre: "Embudo",
        filas: [...ETAPAS.map(([k, t]) => ({ Etapa: t, Pedidos: emb[k] })), { Etapa: "Cancelados (fuera del embudo)", Pedidos: emb.cancelados }],
      },
      { nombre: "Tiempos entre etapas", filas: [...tramos.map((t) => ({ Tramo: t.t, "Minutos promedio": t.min })), { Tramo: "Carga → factura (total)", "Minutos promedio": d.tramos?.carga_factura }] },
      { nombre: "Pedidos por día", filas: dias.map((x) => ({ Día: x.dia, Pedidos: x.total, "A tiempo": x.total - x.tarde, "Fuera de hora límite": x.tarde })) },
      {
        nombre: "Bodegas",
        filas: [
          ...bodegas.map((b) => ({ Bodega: b.codigo, "Cajas bajadas": b.cajas, "Listas completadas": b.listas, "Tiempo medio por lista (min)": b.tiempo_lista_min, Escaneos: b.escaneos, "Errores (%)": errPct(b) != null ? Number(errPct(b).toFixed(2)) : null })),
          { Bodega: "SALDOS", "Cajas bajadas": saldos.cajas_confirmadas, Escaneos: saldos.escaneos, "Errores (%)": errPct(saldos) != null ? Number(errPct(saldos).toFixed(2)) : null },
        ],
      },
      { nombre: "Faltantes de stock", filas: (falt.top || []).map((f) => ({ Referencia: f.referencia, Veces: f.veces, Cajas: f.cajas })) },
    ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {tip}
      {!fijo && (
        <BarraFiltros onExcel={excel} onPdf={() => imprimir(`Panel flujo - ${textoRango(resp)}`)}>
          <SelectorPeriodo id="fl-periodo" periodos={["14d", "semana", "mes", "30d", "personalizado"]} valor={periodo} onChange={setPeriodo} />
          <Selector
            id="fl-prioridad"
            etiqueta="Prioridad"
            valor={prioridad}
            onChange={setPrioridad}
            opciones={[
              { valor: "", texto: "Todas" },
              { valor: "urgente", texto: "Urgente" },
              { valor: "normal", texto: "Normal" },
            ]}
          />
        </BarraFiltros>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
        <Tarjeta id="embudo" titulo="Embudo de pedidos" style={{ flex: "1 1 520px" }} extra={<span style={{ fontSize: "13px", color: COLOR.gris }}>Pedidos cargados en el periodo y hasta dónde llegaron</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {ETAPAS.map(([k, t], i) => {
              const n = emb[k] || 0;
              const prev = i ? emb[ETAPAS[i - 1][0]] || 0 : null;
              const perdida = prev != null ? prev - n : 0;
              const ultimo = i === ETAPAS.length - 1;
              return (
                <div key={k} {...tipProps(`${t}: ${num(n)} pedidos${i ? `\n${num(perdida)} sin avanzar desde ${ETAPAS[i - 1][1].toLowerCase()}` : ""}`)} style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 120px", alignItems: "center", gap: "12px", outline: "none" }}>
                  <span style={{ fontSize: "14px", color: COLOR.gris }}>{t}</span>
                  <div
                    style={{
                      width: `${Math.max(n > 0 ? 12 : 0, (n / max) * 100)}%`,
                      background: ultimo ? COLOR.verde : COLOR.negro,
                      color: ultimo ? COLOR.negro : "#FFFFFF",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "16px",
                      boxSizing: "border-box",
                      minHeight: "38px",
                    }}
                  >
                    {num(n)}
                  </div>
                  <span style={{ fontSize: "13px", color: perdida > 0 ? COLOR.rojo : COLOR.gris, fontWeight: perdida > 0 ? 600 : 400 }}>
                    {i === 0 ? "100 %" : perdida > 0 ? `${num(perdida)} sin avanzar` : "Sin pérdidas"}
                  </span>
                </div>
              );
            })}
          </div>
          <Nota>
            Se excluyen {num(emb.cancelados)} pedidos cancelados. «Sin avanzar» incluye los que aún están en curso.
          </Nota>
        </Tarjeta>

        <Tarjeta id="etapas" titulo="Tiempo medio entre etapas" style={{ flex: "1 1 420px" }}>
          <p style={{ margin: "0 0 16px", fontSize: "14px" }}>
            Total de carga a factura: <strong>{duracion(d.tramos?.carga_factura)}</strong>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {tramos.map((t) => (
              <div key={t.k} {...tipProps(`${t.t}: ${duracion(t.min)}`)} style={{ display: "flex", flexDirection: "column", gap: "4px", outline: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", gap: "8px" }}>
                  <span>{t.t}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace" }}>{duracion(t.min)}</span>
                </div>
                <div style={{ height: "12px", background: COLOR.bordeSuave, borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((t.min || 0) / maxTramo) * 100}%`, background: t === cuello ? COLOR.rojo : COLOR.negro, borderRadius: "0 4px 4px 0" }} />
                </div>
              </div>
            ))}
          </div>
          {cuello?.min > 0 && (
            <Nota style={{ color: COLOR.rojo, fontWeight: 600 }}>Cuello de botella: {cuello.t.toLowerCase()}.</Nota>
          )}
        </Tarjeta>
      </div>

      <Tarjeta
        id="tarde"
        titulo="Pedidos por día y fuera de hora límite"
        extra={
          <Leyenda
            items={[
              { texto: "A tiempo", color: COLOR.verdeBarra },
              { texto: "Fuera de hora límite", color: COLOR.rojo },
            ]}
          />
        }
      >
        <div
          role="img"
          aria-label={`Pedidos cargados por día: ${num(totalDias)} en ${dias.length} días, ${num(totalTarde)} fuera de hora límite`}
          style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`, gap: dias.length > 20 ? "3px" : "8px", alignItems: "end", height: "220px", borderBottom: "1px solid #C9CDD4" }}
        >
          {dias.map((x) => (
            <div key={x.dia} {...tipProps(`${diaCorto(x.dia)}\n${num(x.total)} pedidos\n${num(x.total - x.tarde)} a tiempo · ${num(x.tarde)} fuera de hora límite`)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "4px", height: "100%", outline: "none" }}>
              {dias.length <= 20 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: COLOR.gris }}>{x.total || ""}</span>}
              <div style={{ width: "100%", maxWidth: "40px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: x.tarde && x.total - x.tarde ? "2px" : 0, height: `${(x.total / maxDia) * 88}%` }}>
                {x.tarde > 0 && <div style={{ flex: `${x.tarde} 0 0`, minHeight: "3px", background: COLOR.rojo, borderRadius: "4px 4px 0 0" }} />}
                {x.total - x.tarde > 0 && (
                  <div style={{ flex: `${x.total - x.tarde} 0 0`, background: COLOR.verdeBarra, borderRadius: x.tarde ? 0 : "4px 4px 0 0" }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`, gap: dias.length > 20 ? "3px" : "8px", marginTop: "6px" }}>
          {dias.map((x, i) => (
            <span key={x.dia} style={{ textAlign: "center", fontSize: "12px", color: COLOR.gris, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
              {i % cadaN === 0 ? Number(x.dia.slice(8)) : ""}
            </span>
          ))}
        </div>
        <Nota>
          Pedidos según el día en que se cargaron. Fuera de hora límite: el operario lo cerró después de su hora límite, o
          sigue sin cerrar y la hora ya pasó.
        </Nota>
      </Tarjeta>

      <Tarjeta id="comp" titulo="Comparación entre bodegas">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "640px" }}>
            <thead>
              <tr style={{ color: COLOR.gris, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th scope="col" style={{ ...th, textAlign: "left" }}>Bodega</th>
                {["Cajas bajadas", "Listas completadas", "Tiempo medio por lista", "Errores de escaneo"].map((t) => (
                  <th key={t} scope="col" style={{ ...th, textAlign: "right" }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodegas.map((b) => (
                <tr key={b.codigo}>
                  <td style={{ ...td, fontWeight: 600 }}>{b.codigo}</td>
                  <td style={tdNum}>{num(b.cajas)}</td>
                  <td style={tdNum}>{num(b.listas)}</td>
                  <td style={tdNum}>{duracion(b.tiempo_lista_min)}</td>
                  <td style={tdNum}>{pct(errPct(b))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>SALDOS</td>
                <td style={tdNum}>{num(saldos.cajas_confirmadas)} confirmadas</td>
                <td style={tdNum}>—</td>
                <td style={tdNum}>—</td>
                <td style={tdNum}>{pct(errPct(saldos))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Nota>
          Tiempo por lista: del primer al último escaneo de sus cajas. La prioridad no filtra esta tabla (una lista
          mezcla pedidos).
        </Nota>
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${COLOR.bordeSuave}` }}>
          <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>
            Faltantes de stock al generar listas: {num(falt.registros)} ({num(falt.cajas)} cajas)
          </div>
          {(falt.top || []).length > 0 && (
            <div style={{ fontSize: "14px", color: COLOR.gris }}>
              Más frecuentes:{" "}
              {falt.top.map((f, i) => (
                <span key={f.referencia}>
                  {i > 0 && " · "}
                  <span style={{ fontFamily: "'DM Mono', monospace", color: COLOR.negro }}>{f.referencia}</span> ({f.veces}{" "}
                  {f.veces === 1 ? "vez" : "veces"})
                </span>
              ))}
            </div>
          )}
          <Nota style={{ marginTop: "6px" }}>
            Se registran desde esta versión: antes los faltantes solo se mostraban en pantalla al generar las listas.
          </Nota>
        </div>
      </Tarjeta>
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: `1px solid ${COLOR.borde}` };
const td = { padding: "10px", borderBottom: `1px solid ${COLOR.bordeSuave}` };
const tdNum = { ...td, textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: "13px" };
