import { useEffect, useState } from "react";
import {
  Aviso,
  BarraFiltros,
  BotonPequeno,
  FilaKpis,
  Insignia,
  Kpi,
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
import {
  COLOR,
  PERIODOS,
  diaCorto,
  duracion,
  maximoEje,
  num,
  pct,
  semaforo,
  textoRango,
  variacion,
} from "./formato";

const porDia = (total, dias) => (dias > 0 ? total / dias : null);
const errPct = (o) => (o.escaneos > 0 ? (100 * o.errores) / o.escaneos : null);

// Tendencia diaria del equipo: línea de pedidos/día por operario y la meta.
function Tendencia({ serie, meta, desde, hasta, tz }) {
  const [tipProps, tip] = useTip();
  // Todos los días del rango, también los que no tuvieron cierres.
  const dias = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const fin = fmt.format(new Date(new Date(hasta).getTime() - 1));
  let t = new Date(desde).getTime() + 12 * 3600000;
  for (let i = 0; i < 400; i++) {
    const ymd = fmt.format(new Date(t));
    dias.push(ymd);
    if (ymd >= fin) break;
    t += 86400000;
  }
  const valor = Object.fromEntries(serie.map((s) => [s.dia, s.operarios > 0 ? s.pedidos / s.operarios : null]));
  const puntos = dias.map((dia, i) => ({ dia, i, v: valor[dia] ?? null }));
  const conDato = puntos.filter((p) => p.v != null);
  const W = 600;
  const H = 240;
  const L = 40;
  const R = 590;
  const T = 20;
  const B = 200;
  // Cuatro divisiones con un paso redondo (1, 2, 2,5, 5 × 10ⁿ).
  const paso = maximoEje(Math.max(meta || 0, ...conDato.map((p) => p.v)) * 1.1 / 4);
  const max = paso * 4;
  const x = (i) => (dias.length > 1 ? L + (i * (R - L)) / (dias.length - 1) : (L + R) / 2);
  const y = (v) => B - (v / max) * (B - T);
  const ticks = [0, paso, paso * 2, paso * 3, max];

  // Tramos continuos (un día sin cierres corta la línea).
  const tramos = [];
  let actual = [];
  for (const p of puntos) {
    if (p.v == null) {
      if (actual.length) tramos.push(actual);
      actual = [];
    } else actual.push(p);
  }
  if (actual.length) tramos.push(actual);

  if (conDato.length === 0) return <Nota style={{ margin: 0 }}>Sin pedidos cerrados en el periodo.</Nota>;
  const primero = conDato[0];
  const ultimo = conDato[conDato.length - 1];

  return (
    <>
      {tip}
      <svg
        role="img"
        aria-label={`Pedidos por día por operario: de ${num(primero.v, 1)} el ${diaCorto(primero.dia)} a ${num(ultimo.v, 1)} el ${diaCorto(ultimo.dia)}; meta ${num(meta, 1)}`}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {ticks.map((v, i) => (
          <g key={v}>
            <line x1={L} y1={y(v)} x2={R} y2={y(v)} stroke={i === 0 ? "#C9CDD4" : COLOR.bordeSuave} strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill={COLOR.gris} fontFamily="DM Mono, monospace">
              {num(v, Number.isInteger(v) ? 0 : 1)}
            </text>
          </g>
        ))}
        {meta != null && (
          <line x1={L} y1={y(meta)} x2={R} y2={y(meta)} stroke={COLOR.naranjaMeta} strokeWidth="2" strokeDasharray="6 5" />
        )}
        {tramos.map((tr) =>
          tr.length > 1 ? (
            <polyline
              key={tr[0].dia}
              fill="none"
              stroke={COLOR.verdeBarra}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={tr.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            />
          ) : null,
        )}
        {conDato.map((p) => (
          <circle key={p.dia} cx={x(p.i)} cy={y(p.v)} r={p === ultimo ? 5 : 3} fill={COLOR.verdeBarra} stroke="#FFFFFF" strokeWidth="2" />
        ))}
        {/* Zonas de hover por día, más anchas que el punto. */}
        {conDato.map((p) => (
          <rect
            key={`h-${p.dia}`}
            x={x(p.i) - Math.max(6, (R - L) / dias.length / 2)}
            y={T}
            width={Math.max(12, (R - L) / dias.length)}
            height={B - T}
            fill="transparent"
            style={{ outline: "none" }}
            {...tipProps(`${diaCorto(p.dia)}\n${num(p.v, 1)} pedidos/día por operario`)}
          />
        ))}
        <text x={L} y={226} fontSize="12" fill={COLOR.gris} fontFamily="DM Mono, monospace">{diaCorto(dias[0])}</text>
        {dias.length > 2 && (
          <text x={(L + R) / 2} y={226} textAnchor="middle" fontSize="12" fill={COLOR.gris} fontFamily="DM Mono, monospace">
            {diaCorto(dias[Math.floor((dias.length - 1) / 2)])}
          </text>
        )}
        {dias.length > 1 && (
          <text x={R} y={226} textAnchor="end" fontSize="12" fill={COLOR.gris} fontFamily="DM Mono, monospace">{diaCorto(dias[dias.length - 1])}</text>
        )}
      </svg>
    </>
  );
}

export default function Operarios({ fijo, onCargado }) {
  const [periodo, setPeriodo] = useState(fijo || { periodo: "30d" });
  const [rol, setRol] = useState("operarios");
  const [persona, setPersona] = useState("");
  const { datos: resp, error } = useDatosPanel("/api/panel/operarios", paramsPeriodo(periodo), {
    activo: !periodo.pendiente,
  });
  const [tipProps, tip] = useTip();

  useEffect(() => {
    if (resp && onCargado) onCargado();
  }, [resp, onCargado]);

  if (!resp) return <Aviso tipo={error ? "error" : "info"}>{error || "Cargando…"}</Aviso>;

  const info = PERIODOS[resp.periodo];
  const meta = resp.metas?.pedidos_dia_operario;
  const ind = resp.indicadores || {};
  const ant = resp.indicadores_anterior || {};

  const operarios = (resp.datos?.operarios || []).map((o) => {
    const dia = porDia(o.pedidos, o.dias);
    return { ...o, porDia: dia, errPct: errPct(o), estado: semaforo(dia, meta, "mayor") };
  });
  const montas = (resp.datos?.montacarguistas || []).map((m) => ({
    ...m,
    cajasDia: porDia(m.cajas, m.dias),
    listasDia: porDia(m.listas, m.dias),
    errPct: errPct(m),
  }));
  const conPedidos = operarios.filter((o) => o.porDia != null);
  const enMeta = conPedidos.filter((o) => o.estado === "ok").length;
  const ranking = [...conPedidos]
    .filter((o) => !persona || o.id === persona)
    .sort((a, b) => b.porDia - a.porDia);
  const escala = maximoEje(Math.max(meta || 0, ...ranking.map((o) => o.porDia)) * 1.1);
  const detalle = operarios.filter((o) => !persona || o.id === persona);
  const verOperarios = rol !== "montacarguistas";
  const verMontas = rol !== "operarios";
  const personas = [...operarios, ...montas].filter((p) =>
    rol === "operarios" ? operarios.includes(p) : rol === "montacarguistas" ? montas.includes(p) : true,
  );

  const filasDetalle = () =>
    detalle.map((o) => ({
      Operario: o.nombre,
      "Pedidos/día": o.porDia != null ? Number(o.porDia.toFixed(2)) : null,
      "Pedidos periodo": o.pedidos,
      "Días con cierres": o.dias,
      "Tiempo medio/pedido (min)": o.tiempo_medio_min,
      Escaneos: o.escaneos,
      "Errores escaneo": o.errores,
      "Errores escaneo (%)": o.errPct != null ? Number(o.errPct.toFixed(2)) : null,
      "Diferencias verificación": o.diferencias,
      Reaperturas: o.reaperturas,
      "Frente a la meta": o.estado ? { ok: "En meta", cerca: "Cerca", bajo: "Bajo meta" }[o.estado] : "Sin pedidos",
    }));
  const filasMontas = () =>
    montas.map((m) => ({
      Montacarguista: m.nombre,
      "Cajas bajadas": m.cajas,
      "Días con actividad": m.dias,
      "Cajas/día": m.cajasDia != null ? Number(m.cajasDia.toFixed(1)) : null,
      "Listas completadas": m.listas,
      "Listas/día": m.listasDia != null ? Number(m.listasDia.toFixed(2)) : null,
      Escaneos: m.escaneos,
      "Errores (%)": m.errPct != null ? Number(m.errPct.toFixed(2)) : null,
    }));
  const nombreArchivo = `productividad_${resp.desde.slice(0, 10)}_${resp.hasta.slice(0, 10)}.xlsx`;
  const excel = () =>
    descargarExcel(nombreArchivo, [
      { nombre: "Operarios", filas: filasDetalle() },
      { nombre: "Montacarguistas", filas: filasMontas() },
      {
        nombre: "Tendencia diaria",
        filas: (resp.datos?.serie || []).map((s) => ({
          Día: s.dia,
          "Pedidos cerrados": s.pedidos,
          "Operarios con cierres": s.operarios,
          "Pedidos/día por operario": s.operarios ? Number((s.pedidos / s.operarios).toFixed(2)) : null,
        })),
      },
    ]);

  const vPedidos = variacion(ind.pedidos_dia_operario, ant.pedidos_dia_operario, { modo: "abs", dec: 1, compara: info.compara });
  const vTiempo = variacion(ind.tiempo_medio_pedido_min, ant.tiempo_medio_pedido_min, { modo: "abs", sentido: "menor", compara: info.compara });
  const vErr = variacion(ind.errores_escaneo_pct, ant.errores_escaneo_pct, { modo: "pts", sentido: "menor", dec: 1, compara: info.compara });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {tip}
      {!fijo && (
        <BarraFiltros onExcel={excel} onPdf={() => imprimir(`Panel operarios - ${textoRango(resp)}`)}>
          <SelectorPeriodo
            id="op-periodo"
            periodos={["30d", "semana", "mes", "7d", "personalizado"]}
            valor={periodo}
            onChange={setPeriodo}
          />
          <Selector
            id="op-rol"
            etiqueta="Rol"
            valor={rol}
            onChange={(v) => {
              setRol(v);
              setPersona("");
            }}
            opciones={[
              { valor: "operarios", texto: "Operarios" },
              { valor: "montacarguistas", texto: "Montacarguistas" },
              { valor: "todos", texto: "Todos" },
            ]}
          />
          <Selector
            id="op-persona"
            etiqueta="Persona"
            valor={persona}
            onChange={setPersona}
            opciones={[{ valor: "", texto: "Todas" }, ...personas.map((p) => ({ valor: p.id, texto: p.nombre }))]}
          />
        </BarraFiltros>
      )}

      {verOperarios && (
        <>
          <FilaKpis etiqueta="Indicadores del equipo">
            <Kpi etiqueta="Pedidos por día (prom. operario)" valor={num(ind.pedidos_dia_operario, 1)} pie={vPedidos.texto} colorPie={vPedidos.color} />
            <Kpi
              etiqueta="Operarios en meta"
              valor={`${enMeta} de ${conPedidos.length}`}
              pie={`Meta: ${num(meta, 1)} pedidos/día`}
            />
            <Kpi etiqueta="Tiempo medio por pedido" valor={duracion(ind.tiempo_medio_pedido_min)} pie={vTiempo.texto} colorPie={vTiempo.color} />
            <Kpi etiqueta="Errores de escaneo" valor={pct(ind.errores_escaneo_pct)} pie={vErr.texto} colorPie={vErr.color} />
          </FilaKpis>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "stretch" }}>
            <Tarjeta
              id="ranking"
              titulo="Pedidos por día — promedio por operario"
              style={{ flex: "1 1 520px" }}
              extra={<Leyenda items={[{ texto: `Meta ${num(meta, 1)}`, color: COLOR.naranjaMeta, linea: true, discontinua: true }]} />}
            >
              {ranking.length === 0 ? (
                <Nota style={{ margin: 0 }}>Sin pedidos cerrados en el periodo.</Nota>
              ) : (
                <div role="img" aria-label={`Pedidos por día por operario: ${ranking.map((o) => `${o.nombre} ${num(o.porDia, 1)}`).join(", ")}; meta ${num(meta, 1)}`} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {ranking.map((o) => (
                    <div
                      key={o.id}
                      {...tipProps(`${o.nombre}\n${num(o.porDia, 1)} pedidos/día\n${num(o.pedidos)} pedidos en ${num(o.dias)} días`)}
                      style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) minmax(0, 1fr) 44px", alignItems: "center", gap: "10px", fontSize: "14px", outline: "none" }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</span>
                      <div style={{ position: "relative", height: "18px" }}>
                        <div style={{ height: "100%", width: `${(o.porDia / escala) * 100}%`, background: o.estado === "ok" ? COLOR.verdeBarra : COLOR.grisBarra, borderRadius: "0 4px 4px 0" }} />
                        {meta != null && (
                          <div aria-hidden="true" style={{ position: "absolute", top: "-4px", bottom: "-4px", left: `${(meta / escala) * 100}%`, borderLeft: `2px dashed ${COLOR.naranjaMeta}` }} />
                        )}
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{num(o.porDia, 1)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Nota>Barra verde: cumple la meta. Barra gris: por debajo. Pedidos/día = pedidos cerrados ÷ días en que el operario cerró al menos uno.</Nota>
            </Tarjeta>

            <Tarjeta
              id="tendencia"
              titulo={`Tendencia del equipo — ${info.etiqueta.toLowerCase().replace("…", "")}`}
              style={{ flex: "1 1 520px" }}
              extra={
                <Leyenda
                  items={[
                    { texto: "Pedidos/día por operario", color: COLOR.verdeBarra, linea: true },
                    { texto: "Meta", color: COLOR.naranjaMeta, linea: true, discontinua: true },
                  ]}
                />
              }
            >
              <Tendencia serie={resp.datos?.serie || []} meta={meta} desde={resp.desde} hasta={resp.hasta} tz={resp.zona_horaria} />
            </Tarjeta>
          </div>

          <Tarjeta
            id="detalle"
            titulo="Detalle por operario"
            extra={
              <BotonPequeno onClick={() => descargarExcel(`detalle_operarios_${resp.desde.slice(0, 10)}.xlsx`, [{ nombre: "Operarios", filas: filasDetalle() }])}>
                Descargar esta tabla
              </BotonPequeno>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "820px" }}>
                <thead>
                  <tr style={{ color: COLOR.gris, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <th scope="col" style={{ ...th, textAlign: "left" }}>Operario</th>
                    {["Pedidos/día", "Pedidos periodo", "Tiempo medio/pedido", "Errores escaneo", "Diferencias verif.", "Reaperturas"].map((t) => (
                      <th key={t} scope="col" style={{ ...th, textAlign: "right" }}>{t}</th>
                    ))}
                    <th scope="col" style={{ ...th, textAlign: "left" }}>Frente a la meta</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((o) => (
                    <tr key={o.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{o.nombre}</td>
                      <td style={tdNum}>{num(o.porDia, 1)}</td>
                      <td style={tdNum}>{num(o.pedidos)}</td>
                      <td style={tdNum}>{duracion(o.tiempo_medio_min)}</td>
                      <td style={tdNum}>{pct(o.errPct)}</td>
                      <td style={tdNum}>{num(o.diferencias)}</td>
                      <td style={tdNum}>{num(o.reaperturas)}</td>
                      <td style={td}><Insignia estado={o.estado} texto={o.estado ? undefined : "Sin pedidos"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Nota>
              Tiempo medio: de la asignación al cierre del pedido. Diferencias verif.: ítems de sus pedidos que salieron
              con diferencia en verificación. «Cerca» = a menos de un 15 % de la meta.
            </Nota>
          </Tarjeta>
        </>
      )}

      {verMontas && (
        <Tarjeta id="monta" titulo="Montacarguistas">
          {montas.length === 0 ? (
            <Nota style={{ margin: 0 }}>Sin montacarguistas activos.</Nota>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              {montas
                .filter((m) => !persona || m.id === persona)
                .map((m) => (
                  <div key={m.id} style={{ border: `1px solid ${COLOR.borde}`, borderRadius: "10px", padding: "16px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "10px" }}>{m.nombre}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                      {[
                        ["Cajas/día", num(m.cajasDia, 0)],
                        ["Listas/día", num(m.listasDia, 1)],
                        ["Errores", pct(m.errPct)],
                      ].map(([t, v]) => (
                        <div key={t} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "12px", color: COLOR.gris }}>{t}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: "12px", color: COLOR.gris, marginTop: "8px" }}>
                      {num(m.cajas)} cajas · {num(m.listas)} listas · {num(m.dias)} días con actividad
                    </div>
                  </div>
                ))}
            </div>
          )}
          <Nota>Caja bajada = escaneo correcto de la caja. Listas/día cuenta las listas completadas en el periodo.</Nota>
        </Tarjeta>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: `1px solid ${COLOR.borde}` };
const td = { padding: "10px", borderBottom: `1px solid ${COLOR.bordeSuave}` };
const tdNum = { ...td, textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: "13px" };
