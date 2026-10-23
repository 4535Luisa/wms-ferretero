import { useEffect, useState } from "react";
import api from "../../services/api";
import {
  Aviso,
  Insignia,
  Nota,
  Selector,
  Tarjeta,
} from "./ui";
import {
  descargarExcel,
  estiloBoton,
  useDatosPanel,
  useTip,
} from "./herramientas";
import { COLOR, PERIODOS, SEMAFORO, duracion, fechaLocal, num, pct } from "./formato";

const SIGNO = { mayor: "≥", menor: "≤" };

function valorMeta(m, v) {
  if (v == null) return "—";
  if (m.unidad === "min") return duracion(v);
  if (m.unidad === "%") return pct(v);
  return num(v, 1);
}

function Sparkline({ historial, color, nombre, unidad, tipProps }) {
  const vals = historial.map((h) => h.valor).filter((v) => v != null);
  if (vals.length < 2) return <span style={{ fontSize: "12px", color: COLOR.gris }}>Pocos datos</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const r = max - min || 1;
  const n = historial.length;
  const x = (i) => 4 + (i * 112) / (n - 1);
  const y = (v) => 28 - ((v - min) / r) * 24;
  const puntos = historial.map((h, i) => (h.valor == null ? null : `${x(i)},${y(h.valor)}`)).filter(Boolean);
  const texto = historial
    .map((h) => `${fechaLocal(h.desde)}: ${h.valor == null ? "sin datos" : `${num(h.valor, 1)}${unidad === "%" ? " %" : ""}`}`)
    .join("\n");
  return (
    <svg
      viewBox="0 0 120 32"
      width="120"
      height="32"
      {...tipProps(`${nombre}, por semana\n${texto}`)}
      style={{ display: "block", outline: "none" }}
    >
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={puntos.join(" ")} />
    </svg>
  );
}

function tendencia(m) {
  if (m.actual == null || m.anterior == null) return { texto: "Sin datos", color: COLOR.gris };
  const d = Number(m.actual) - Number(m.anterior);
  const dec = m.unidad === "min" ? 0 : 1;
  if (Number(Math.abs(d).toFixed(dec)) === 0) return { texto: "Igual", color: COLOR.gris };
  const mejora = m.sentido === "mayor" ? d > 0 : d < 0;
  const cifra = m.unidad === "min" ? duracion(Math.abs(d)) : `${num(Math.abs(d), dec)}${m.unidad === "%" ? " pts" : ""}`;
  return {
    texto: `${d > 0 ? "+" : "−"}${cifra} · ${mejora ? "mejora" : "empeora"}`,
    color: mejora ? COLOR.verdeTexto : COLOR.rojo,
  };
}

const TAG = {
  operarios: { t: "OPERARIOS", bg: COLOR.negro, fg: "#FFFFFF" },
  flujo: { t: "FLUJO", bg: COLOR.borde, fg: COLOR.negro },
  mercancia: { t: "MERCANCÍA", bg: COLOR.verde, fg: COLOR.negro },
};

export default function Metas({ esAdmin, onInforme }) {
  const { datos: resp, error, recargar } = useDatosPanel("/api/panel/metas", {});
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [periodoDesc, setPeriodoDesc] = useState("semana");
  const [descargando, setDescargando] = useState(null);
  const [tipProps, tip] = useTip();

  useEffect(() => {
    if (!resp) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBorrador(Object.fromEntries(resp.metas.map((m) => [m.clave, String(m.meta).replace(".", ",")])));
  }, [resp]);

  if (!resp) return <Aviso tipo={error ? "error" : "info"}>{error || "Cargando…"}</Aviso>;

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      await api.put("/api/panel/metas", { metas: borrador });
      setMensaje({ ok: true, texto: "Metas guardadas" });
      await recargar();
    } catch (e) {
      setMensaje({ ok: false, texto: e.response?.data?.error || "No se pudieron guardar las metas" });
    } finally {
      setGuardando(false);
    }
  };

  const descargar = async (clave, fn) => {
    setDescargando(clave);
    setMensaje(null);
    try {
      await fn();
    } catch (e) {
      setMensaje({ ok: false, texto: e.response?.data?.error || "No se pudo preparar la descarga" });
    } finally {
      setDescargando(null);
    }
  };

  const params = { periodo: periodoDesc };
  const sufijo = periodoDesc;
  const descargas = [
    { clave: "sem", nombre: "Informe semanal completo", desc: "Todas las pestañas con gráficas, esta semana", formato: "PDF", fn: () => onInforme({ periodo: "semana" }) },
    { clave: "mes", nombre: "Informe mensual completo", desc: "Todas las pestañas con gráficas, este mes", formato: "PDF", fn: () => onInforme({ periodo: "mes" }) },
    {
      clave: "prod",
      nombre: "Productividad por operario",
      desc: "Pedidos por día, tiempos y errores",
      formato: "Excel",
      fn: async () => {
        const { data } = await api.get("/api/panel/operarios", { params });
        await descargarExcel(`productividad_${sufijo}.xlsx`, [
          {
            nombre: "Operarios",
            filas: data.datos.operarios.map((o) => ({
              Operario: o.nombre,
              "Pedidos cerrados": o.pedidos,
              "Días con cierres": o.dias,
              "Pedidos/día": o.dias ? Number((o.pedidos / o.dias).toFixed(2)) : null,
              "Tiempo medio/pedido (min)": o.tiempo_medio_min,
              Escaneos: o.escaneos,
              "Errores escaneo": o.errores,
              "Diferencias verificación": o.diferencias,
              Reaperturas: o.reaperturas,
            })),
          },
          {
            nombre: "Montacarguistas",
            filas: data.datos.montacarguistas.map((m) => ({
              Montacarguista: m.nombre,
              "Cajas bajadas": m.cajas,
              "Días con actividad": m.dias,
              "Listas completadas": m.listas,
              Escaneos: m.escaneos,
              Errores: m.errores,
            })),
          },
        ]);
      },
    },
    {
      clave: "act",
      nombre: "Actividad de usuarios",
      desc: "Registro de acciones por usuario y hora",
      formato: "Excel",
      fn: async () => {
        const { data } = await api.get("/api/panel/actividad", { params });
        await descargarExcel(`actividad_usuarios_${sufijo}.xlsx`, [
          {
            nombre: "Actividad",
            filas: data.filas.map((f) => ({
              Fecha: new Date(f.fecha).toLocaleString("es-CO", { timeZone: data.zona_horaria }),
              Usuario: f.usuario,
              Rol: f.rol,
              Acción: f.accion,
              Tabla: f.tabla,
              Pedido: f.pedido,
              Resultado: f.resultado,
            })),
          },
        ]);
        if (data.truncado)
          setMensaje({ ok: false, texto: "La actividad tenía más de 20.000 registros: el Excel trae los primeros 20.000. Elige un periodo más corto." });
      },
    },
    {
      clave: "inv",
      nombre: "Inventario y rotación",
      desc: "Stock, ABC, agotadas y sin movimiento",
      formato: "Excel",
      fn: async () => {
        const { data } = await api.get("/api/panel/mercancia", { params });
        const d = data.datos;
        await descargarExcel(`inventario_rotacion_${sufijo}.xlsx`, [
          { nombre: "Stock por bodega", filas: d.stock_bodegas.map((b) => ({ Bodega: b.codigo, Unidades: b.unidades })) },
          { nombre: "Más despachadas", filas: d.top.map((t, i) => ({ Puesto: i + 1, Referencia: t.referencia, Descripción: t.descripcion, Unidades: t.unidades })) },
          { nombre: "ABC", filas: ["A", "B", "C"].map((c) => ({ Clase: c, Referencias: d.abc[c].refs, "Unidades despachadas": d.abc[c].unidades })) },
          { nombre: "Agotadas en picking", filas: d.agotadas.map((a) => ({ Referencia: a.referencia, Descripción: a.descripcion, "Pedidos en el periodo": a.pedidos })) },
          { nombre: "Sin pedidos 90 días", filas: d.sin_movimiento.map((s) => ({ Referencia: s.referencia, Descripción: s.descripcion, Bodega: s.bodega, Stock: s.stock })) },
        ]);
      },
    },
    {
      clave: "aju",
      nombre: "Ajustes y diferencias",
      desc: "Ajustes aprobados, uno por fila",
      formato: "Excel",
      fn: async () => {
        const { data } = await api.get("/api/panel/ajustes", { params });
        await descargarExcel(`ajustes_${sufijo}.xlsx`, [
          {
            nombre: "Ajustes aprobados",
            filas: data.filas.map((a) => ({
              Fecha: new Date(a.fecha).toLocaleString("es-CO", { timeZone: data.zona_horaria }),
              Referencia: a.referencia,
              Descripción: a.descripcion,
              Bodega: a.bodega,
              Tipo: a.tipo,
              Unidades: a.unidades,
              Motivo: a.motivo,
            })),
          },
        ]);
      },
    },
  ];

  const cambiado = resp.metas.some((m) => borrador[m.clave] !== String(m.meta).replace(".", ","));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {tip}
      <Tarjeta
        id="metas"
        titulo={`Metas del equipo — semana desde el ${fechaLocal(resp.semana_desde, resp.zona_horaria)}`}
        subtitulo={esAdmin ? "Puedes editar las metas; el gerente las ve." : "Solo el administrador edita las metas."}
        extra={
          esAdmin && (
            <button type="button" className="panel-no-print" onClick={guardar} disabled={guardando || !cambiado} style={{ ...estiloBoton(true), opacity: guardando || !cambiado ? 0.5 : 1 }}>
              {guardando ? "Guardando…" : "Guardar metas"}
            </button>
          )
        }
      >
        {mensaje && (
          <div role={mensaje.ok ? "status" : "alert"} style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "8px", fontSize: "14px", background: mensaje.ok ? "#E3F7EC" : "#FDECEC", color: mensaje.ok ? COLOR.verdeTexto : COLOR.rojo }}>
            {mensaje.texto}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "860px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLOR.gris, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {["Indicador", "Meta", "Actual", "Estado", "Últimas 8 semanas", "vs. semana anterior"].map((t) => (
                  <th key={t} scope="col" style={t === "Actual" ? { ...th, textAlign: "right" } : th}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resp.metas.map((m) => {
                const t = tendencia(m);
                return (
                  <tr key={m.clave}>
                    <td style={{ ...td, fontWeight: 600 }}>{m.nombre}</td>
                    <td style={td}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", fontSize: "13px", color: COLOR.gris }}>
                        <span>{SIGNO[m.sentido]}</span>
                        {esAdmin ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={borrador[m.clave] ?? ""}
                            aria-label={`Meta de ${m.nombre}`}
                            onChange={(e) => setBorrador((b) => ({ ...b, [m.clave]: e.target.value }))}
                            style={{ width: "72px", font: "inherit", fontFamily: "'DM Mono', monospace", fontSize: "14px", color: COLOR.negro, padding: "6px 8px", border: "1px solid #C9CDD4", borderRadius: "6px", textAlign: "right" }}
                          />
                        ) : (
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: COLOR.negro }}>{num(m.meta, 1)}</span>
                        )}
                        <span>{m.unidad}</span>
                      </label>
                    </td>
                    <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontSize: "16px", textAlign: "right", whiteSpace: "nowrap" }}>{valorMeta(m, m.actual)}</td>
                    <td style={td}><Insignia estado={m.estado} /></td>
                    <td style={td}>
                      <Sparkline historial={m.historial} color={SEMAFORO[m.estado]?.linea || COLOR.grisBarra} nombre={m.nombre} unidad={m.unidad} tipProps={tipProps} />
                    </td>
                    <td style={{ ...td, fontSize: "13px", fontWeight: 600, color: t.color, whiteSpace: "nowrap" }}>{t.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Nota>
          «Actual» es lo que va de esta semana (de lunes a hoy). «Cerca» = a menos de un 15 % de la meta.
          {resp.actualizado_en && ` Metas actualizadas el ${fechaLocal(resp.actualizado_en, resp.zona_horaria)}.`}
        </Nota>
      </Tarjeta>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
        <Tarjeta
          id="focos"
          titulo="Focos de atención"
          subtitulo={`Calculados con la semana pasada completa (${fechaLocal(resp.focos_desde, resp.zona_horaria)} – ${fechaLocal(new Date(new Date(resp.focos_hasta).getTime() - 1).toISOString(), resp.zona_horaria)}); cambian cada lunes.`}
          style={{ flex: "1 1 560px" }}
        >
          {resp.focos.length === 0 ? (
            <Nota style={{ margin: 0 }}>Sin focos: la semana pasada se cumplieron las metas y no hubo faltantes ni agotadas.</Nota>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {resp.focos.map((f) => (
                <div key={f.titulo} style={{ border: `1px solid ${COLOR.borde}`, borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: TAG[f.tipo].bg, color: TAG[f.tipo].fg }}>
                      {TAG[f.tipo].t}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "15px" }}>{f.titulo}</span>
                  </div>
                  <span style={{ fontSize: "14px", color: "#3A3F4B", lineHeight: 1.45 }}>{f.detalle}</span>
                  <span style={{ fontSize: "13px", color: COLOR.verdeTexto, fontWeight: 600 }}>Acción sugerida: {f.accion}</span>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          id="desc"
          titulo="Descargas"
          subtitulo="Los Excel usan el periodo elegido aquí."
          style={{ flex: "1 1 460px", breakInside: "auto" }}
          extra={
            <div className="panel-no-print">
              <Selector
                id="desc-periodo"
                etiqueta="Periodo de los Excel"
                valor={periodoDesc}
                onChange={setPeriodoDesc}
                opciones={["semana", "mes", "7d", "30d"].map((p) => ({ valor: p, texto: PERIODOS[p].etiqueta }))}
              />
            </div>
          }
        >
          <div className="panel-no-print" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {descargas.map((dsc) => (
              <div key={dsc.clave} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", border: `1px solid ${COLOR.borde}`, borderRadius: "10px", padding: "12px 14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{dsc.nombre}</span>
                  <span style={{ fontSize: "13px", color: COLOR.gris }}>{dsc.desc}</span>
                </div>
                <button
                  type="button"
                  aria-label={`Descargar ${dsc.nombre} en ${dsc.formato}`}
                  disabled={descargando != null}
                  onClick={() => descargar(dsc.clave, dsc.fn)}
                  style={{ ...estiloBoton(dsc.formato === "PDF"), fontSize: "13px", fontWeight: 700, padding: "8px 14px", minWidth: "76px", justifyContent: "center", opacity: descargando && descargando !== dsc.clave ? 0.5 : 1 }}
                >
                  {descargando === dsc.clave ? "…" : dsc.formato}
                </button>
              </div>
            ))}
          </div>
          <Nota>
            Los PDF se generan con el diálogo de impresión: elige «Guardar como PDF». Cada pestaña tiene además sus
            propios botones de descarga con sus filtros.
          </Nota>
        </Tarjeta>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: `1px solid ${COLOR.borde}` };
const td = { padding: "10px", borderBottom: `1px solid ${COLOR.bordeSuave}` };
