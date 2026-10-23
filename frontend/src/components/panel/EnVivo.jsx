import { useEffect, useMemo, useState } from "react";
import {
  Aviso,
  BarraFiltros,
  FilaKpis,
  Kpi,
  Leyenda,
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
import {
  COLOR,
  PERIODOS,
  haceTiempo,
  num,
  pct,
  semaforo,
  textoRango,
  variacion,
} from "./formato";

const REFRESCO_MS = 30000;
// La sesión dura 1 hora sin renovarse; inactivo tras 15 min sin acciones.
const SESION_MIN = 60;
const INACTIVO_MIN = 15;

const ROL_LABEL = {
  operario: "Operario",
  montacarguista: "Montacarguista",
  saldos: "Saldos",
  facturacion: "Facturación",
  inventarios: "Inventarios",
  jefe_bodega: "Jefe de bodega",
};

const ESTADO_PEDIDO = [
  ["pendiente", "Pendiente"],
  ["asignado", "Asignado"],
  ["en_proceso", "En proceso"],
  ["en_picking", "En picking"],
  ["en_saldos", "En saldos"],
  ["cerrado", "Cerrado"],
  ["con_diferencia", "Con diferencia"],
  ["verificado", "Verificado"],
];

const ACCION_LABEL = {
  ESCANEO_VERIFICACION: "Escaneando",
  PICKING: "Bajando cajas",
  PICKING_OPERARIO: "Alistando referencias",
  CIERRE_PEDIDO: "Cerró un pedido",
  REAPERTURA_PEDIDO: "Reabrió un pedido",
  REASIGNACION_PEDIDO: "Reasignando pedidos",
  VERIFICACION_PEDIDO: "Verificando pedidos",
  VERIFICACION_SALDO: "Verificando saldos",
  DIFERENCIA_VERIFICACION: "Registrando diferencias",
  FACTURACION: "Facturando",
  CANCELACION_PEDIDO: "Cancelando pedidos",
  ENTREGA_SALDOS: "Entregando saldos",
  RECEPCION_SALDOS: "Recibiendo saldos",
  RECEPCION_CONFIRMADA: "Recibiendo mercancía",
  REGISTRO_ESTIBA: "Registrando estiba",
  AJUSTE_INVENTARIO: "Ajustando inventario",
  AJUSTE_RECHAZADO: "Revisando ajustes",
  PROGRAMAR_CONTEO_FAMILIA: "Programando conteos",
  FALTANTE_STOCK_PICKING: "Generando listas",
};

function etiquetaAccion(accion) {
  if (!accion) return null;
  if (ACCION_LABEL[accion]) return ACCION_LABEL[accion];
  if (accion.startsWith("TRASLADO")) return "Traslados";
  if (accion.startsWith("RECEPCION")) return "Recibiendo mercancía";
  if (accion.startsWith("AJUSTE")) return "Ajustes de inventario";
  const t = accion.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const ESTADO_USUARIO = {
  activo: { texto: "Activo", bg: "#E3F7EC", fg: COLOR.verdeTexto, orden: 0 },
  inactivo: { texto: "Inactivo", bg: "#FFF4D6", fg: COLOR.ambar, orden: 1 },
  off: { texto: "Desconectado", bg: "#EEF0F2", fg: COLOR.gris, orden: 2 },
};

const ms = (iso) => (iso ? new Date(iso).getTime() : 0);

// Estado y actividad actual de cada usuario a partir de sesiones y bitácora.
function describirUsuario(u, ahora) {
  const login = ms(u.ultimo_login);
  const logout = ms(u.ultimo_logout);
  const ultima = Math.max(ms(u.ultima_accion_at), login);
  const conectado = login > 0 && login > logout && ahora - login < SESION_MIN * 60000;
  let estado = "off";
  if (conectado) estado = ahora - ultima < INACTIVO_MIN * 60000 ? "activo" : "inactivo";

  let accion;
  let referencia = u.ultima_accion_pedido || "—";
  if (estado === "off") {
    accion = logout > login ? "Cerró sesión" : "Sin sesión abierta";
  } else if (u.pedido_actual) {
    const p = u.pedido_actual;
    accion = `Alistando pedido · ${p.completos}/${p.items} referencias`;
    referencia = p.numero;
  } else if (u.lista_actual) {
    const l = u.lista_actual;
    accion = `Bajando cajas · ${l.bajadas}/${l.cajas}`;
    referencia = `Lista ${l.bodega || ""}`.trim();
  } else {
    accion = etiquetaAccion(u.ultima_accion) || "Conectado, sin acciones";
  }
  if (estado === "inactivo")
    accion = `Sin acción desde ${Math.round((ahora - ultima) / 60000)} min · ${accion}`;

  return { ...u, estado, accion, referencia, ultimaVez: ultima ? new Date(ultima).toISOString() : null };
}

export default function EnVivo({ fijo, onCargado }) {
  const [periodo, setPeriodo] = useState(fijo || { periodo: "hoy" });
  const [rol, setRol] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());
  const { datos: resp, error, cargando } = useDatosPanel(
    "/api/panel/en-vivo",
    paramsPeriodo(periodo),
    { refrescoMs: fijo ? undefined : REFRESCO_MS, activo: !periodo.pendiente },
  );
  const [tipProps, tip] = useTip();

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (resp && onCargado) onCargado();
  }, [resp, onCargado]);

  const d = resp?.datos;
  const usuarios = useMemo(
    () =>
      (d?.usuarios || [])
        .map((u) => describirUsuario(u, ahora))
        .sort(
          (a, b) =>
            ESTADO_USUARIO[a.estado].orden - ESTADO_USUARIO[b.estado].orden ||
            ms(b.ultimaVez) - ms(a.ultimaVez),
        ),
    [d, ahora],
  );

  if (!resp) return <Aviso tipo={error ? "error" : "info"}>{error || "Cargando…"}</Aviso>;

  const info = PERIODOS[resp.periodo];
  const etq = resp.periodo === "hoy" ? "hoy" : "en el periodo";
  const act = d.actual || {};
  const ant = d.anterior || {};
  const meta = resp.metas?.pedidos_dia_operario;
  const filtrados = rol ? usuarios.filter((u) => u.rol === rol) : usuarios;
  const cuenta = (e) => usuarios.filter((u) => u.estado === e).length;
  const inactivos = cuenta("inactivo");
  const roles = [...new Set(usuarios.map((u) => u.rol))];

  const estados = ESTADO_PEDIDO.map(([k, t]) => ({ k, t, n: d.estados?.[k] || 0 }));
  for (const [k, n] of Object.entries(d.estados || {}))
    if (!ESTADO_PEDIDO.some(([e]) => e === k)) estados.push({ k, t: k, n });
  estados.push({ k: "facturado", t: `Facturado (${etq})`, n: d.facturados_periodo || 0 });
  const maxEstado = Math.max(1, ...estados.map((e) => e.n));

  const fueraTotal = (act.fuera_hora_limite || 0) + (d.abiertos_vencidos || 0);

  const excel = () =>
    descargarExcel(`panel_en_vivo_${resp.periodo}.xlsx`, [
      {
        nombre: "Indicadores",
        filas: [
          { Indicador: "Pedidos alistados", Valor: act.pedidos_cerrados, Anterior: ant.pedidos_cerrados },
          { Indicador: "Pedidos abiertos ahora", Valor: d.abiertos },
          { Indicador: "Pedidos por operario (prom. día)", Valor: act.pedidos_dia_operario, Anterior: ant.pedidos_dia_operario, Meta: meta },
          { Indicador: "Cajas bajadas", Valor: act.cajas_bajadas, Anterior: ant.cajas_bajadas },
          { Indicador: "Errores de escaneo (%)", Valor: act.errores_escaneo_pct, Anterior: ant.errores_escaneo_pct },
          { Indicador: "Cerrados fuera de hora límite", Valor: act.fuera_hora_limite, Anterior: ant.fuera_hora_limite },
          { Indicador: "Abiertos con hora límite vencida", Valor: d.abiertos_vencidos },
        ],
      },
      {
        nombre: "Usuarios",
        filas: usuarios.map((u) => ({
          Usuario: u.nombre,
          Rol: ROL_LABEL[u.rol] || u.rol,
          Estado: ESTADO_USUARIO[u.estado].texto,
          "Haciendo ahora": u.accion,
          "Pedido / lista": u.referencia,
          "Última acción": u.ultimaVez ? new Date(u.ultimaVez).toLocaleString("es-CO", { timeZone: resp.zona_horaria }) : "",
        })),
      },
      { nombre: "Pedidos por estado", filas: estados.map((e) => ({ Estado: e.t, Pedidos: e.n })) },
      {
        nombre: "Actividad por hora",
        filas: (d.horas || []).map((h) => ({ Hora: `${h.hora}:00`, "Escaneos correctos": h.ok, Errores: h.errores })),
      },
    ]);

  // Horas visibles: de 6 a 17 como mínimo, ampliando si hubo actividad fuera.
  const porHora = Object.fromEntries((d.horas || []).map((h) => [h.hora, h]));
  const horasDatos = (d.horas || []).map((h) => h.hora);
  const hIni = Math.min(6, ...horasDatos);
  const hFin = Math.max(17, ...horasDatos);
  const horas = [];
  for (let h = hIni; h <= hFin; h++) horas.push(porHora[h] || { hora: h, ok: 0, errores: 0 });
  const maxHora = Math.max(1, ...horas.map((h) => h.ok + h.errores));
  const pico = horas.reduce((a, b) => (b.ok + b.errores > a.ok + a.errores ? b : a), horas[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {tip}
      {!fijo && (
        <BarraFiltros onExcel={excel} onPdf={() => imprimir(`Panel en vivo - ${textoRango(resp)}`)}>
          <SelectorPeriodo
            id="vivo-periodo"
            periodos={["hoy", "semana", "mes", "personalizado"]}
            valor={periodo}
            onChange={setPeriodo}
          />
          <Selector
            id="vivo-rol"
            etiqueta="Rol"
            valor={rol}
            onChange={setRol}
            opciones={[{ valor: "", texto: "Todos" }, ...roles.map((r) => ({ valor: r, texto: ROL_LABEL[r] || r }))]}
          />
          <span style={{ fontSize: "13px", color: error ? COLOR.rojo : COLOR.gris, alignSelf: "center" }} aria-live="polite">
            {error ? "Sin conexión — reintentando…" : cargando ? "Actualizando…" : `Actualizado ${haceTiempo(resp.generado_en, ahora)}`}
          </span>
        </BarraFiltros>
      )}

      <FilaKpis etiqueta="Indicadores">
        <Kpi
          etiqueta={`Pedidos alistados ${etq}`}
          valor={`${num(act.pedidos_cerrados)} / ${num((act.pedidos_cerrados || 0) + (d.abiertos || 0))}`}
          pie={variacion(act.pedidos_cerrados, ant.pedidos_cerrados, { compara: info.compara }).texto}
          colorPie={variacion(act.pedidos_cerrados, ant.pedidos_cerrados, { compara: info.compara }).color}
        />
        <Kpi
          etiqueta="Pedidos por operario (prom. día)"
          valor={num(act.pedidos_dia_operario, 1)}
          pie={`Meta: ${num(meta, 1)}`}
          colorPie={
            semaforo(act.pedidos_dia_operario, meta, "mayor") === "bajo" ? COLOR.rojo : COLOR.gris
          }
        />
        <Kpi
          etiqueta={`Cajas bajadas ${etq}`}
          valor={num(act.cajas_bajadas)}
          pie={variacion(act.cajas_bajadas, ant.cajas_bajadas, { compara: info.compara }).texto}
          colorPie={variacion(act.cajas_bajadas, ant.cajas_bajadas, { compara: info.compara }).color}
        />
        <Kpi
          etiqueta="Errores de escaneo"
          valor={pct(act.errores_escaneo_pct)}
          pie={variacion(act.errores_escaneo_pct, ant.errores_escaneo_pct, { modo: "pts", sentido: "menor", dec: 1, compara: info.compara }).texto}
          colorPie={variacion(act.errores_escaneo_pct, ant.errores_escaneo_pct, { modo: "pts", sentido: "menor", dec: 1, compara: info.compara }).color}
        />
        <Kpi
          etiqueta="Pedidos fuera de hora límite"
          valor={num(fueraTotal)}
          pie={`${num(act.fuera_hora_limite)} cerrados tarde · ${num(d.abiertos_vencidos)} abiertos vencidos`}
          colorPie={fueraTotal > 0 ? COLOR.rojo : COLOR.gris}
        />
      </FilaKpis>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
        <Tarjeta
          id="usuarios"
          titulo="Qué está haciendo cada usuario ahora"
          style={{ flex: "999 1 640px" }}
          extra={
            <span style={{ fontSize: "13px", color: COLOR.gris }}>
              {cuenta("activo")} activos · {inactivos} inactivos · {cuenta("off")} desconectados
            </span>
          }
        >
          {filtrados.length === 0 ? (
            <Nota style={{ margin: 0 }}>No hay usuarios activos con este rol.</Nota>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "760px" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: COLOR.gris, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {["Usuario", "Rol", "Estado", "Haciendo ahora", "Pedido / lista"].map((t) => (
                      <th key={t} scope="col" style={th}>{t}</th>
                    ))}
                    <th scope="col" style={{ ...th, textAlign: "right" }}>Última acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => {
                    const e = ESTADO_USUARIO[u.estado];
                    return (
                      <tr key={u.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{u.nombre}</td>
                        <td style={{ ...td, color: COLOR.gris }}>{ROL_LABEL[u.rol] || u.rol}</td>
                        <td style={td}><Pastilla texto={e.texto} bg={e.bg} fg={e.fg} /></td>
                        <td style={td}>{u.accion}</td>
                        <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>{u.referencia}</td>
                        <td style={{ ...td, textAlign: "right", color: COLOR.gris, whiteSpace: "nowrap" }}>
                          {u.ultimaVez ? haceTiempo(u.ultimaVez, ahora) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Nota>
            Conectado: inició sesión hace menos de {SESION_MIN} min y no la cerró. Inactivo: conectado y sin acciones
            registradas en {INACTIVO_MIN} min.
          </Nota>
        </Tarjeta>

        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: "24px" }}>
          <Tarjeta id="alertas" titulo="Requiere atención">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { n: d.alertas?.urgentes_en_riesgo, texto: "Pedidos urgentes vencidos o a menos de 1 h de su hora límite", grave: true },
                { n: inactivos, texto: `Usuarios inactivos más de ${INACTIVO_MIN} min durante el turno`, medio: true },
                { n: d.alertas?.saldos_por_confirmar, texto: "Cajas con destino SALDOS esperando confirmación", medio: true },
                { n: d.alertas?.esperando_verificacion, texto: "Pedidos cerrados esperando verificación" },
              ].map((a) => {
                const hay = a.n > 0;
                const bg = hay && a.grave ? "#FDECEC" : hay && a.medio ? "#FFF4D6" : "#EEF0F2";
                const fg = hay && a.grave ? COLOR.rojo : hay && a.medio ? COLOR.ambar : COLOR.negro;
                return (
                  <div key={a.texto} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px", borderRadius: "10px", background: bg }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px", fontWeight: 500, minWidth: "32px", color: fg }}>
                      {num(a.n)}
                    </span>
                    <span style={{ fontSize: "14px", lineHeight: 1.4 }}>{a.texto}</span>
                  </div>
                );
              })}
            </div>
          </Tarjeta>

          <Tarjeta id="estados" titulo="Pedidos por estado">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {estados.map((e) => (
                <div
                  key={e.k}
                  {...tipProps(`${e.t}: ${num(e.n)} pedidos`)}
                  style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 44px", alignItems: "center", gap: "10px", fontSize: "14px", outline: "none" }}
                >
                  <span style={{ color: COLOR.gris }}>{e.t}</span>
                  <div style={{ height: "14px", background: COLOR.bordeSuave, borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(e.n / maxEstado) * 100}%`, background: COLOR.negro, borderRadius: "4px" }} />
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{num(e.n)}</span>
                </div>
              ))}
            </div>
            <Nota>Estado actual de todos los pedidos; los facturados, solo los del periodo.</Nota>
          </Tarjeta>
        </div>
      </div>

      <Tarjeta
        id="hora"
        titulo={`Actividad por hora — ${resp.periodo === "hoy" ? "hoy" : textoRango(resp)}`}
        extra={
          <Leyenda
            items={[
              { texto: "Escaneos correctos", color: COLOR.verdeBarra },
              { texto: "Errores de escaneo", color: COLOR.rojo },
            ]}
          />
        }
      >
        <div
          role="img"
          aria-label={`Escaneos por hora de ${hIni} a ${hFin} h; el pico es a las ${pico.hora} h con ${pico.ok + pico.errores} escaneos`}
          style={{ display: "grid", gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))`, gap: "10px", alignItems: "end", height: "220px", borderBottom: "1px solid #C9CDD4", paddingTop: "8px" }}
        >
          {horas.map((h) => {
            const total = h.ok + h.errores;
            return (
              <div
                key={h.hora}
                {...tipProps(`${h.hora}:00 – ${h.hora + 1}:00\n${num(h.ok)} escaneos correctos\n${num(h.errores)} errores`)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "4px", height: "100%", outline: "none", cursor: "default" }}
              >
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: COLOR.gris }}>{total ? num(total) : ""}</span>
                <div style={{ width: "100%", maxWidth: "44px", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: `${(total / maxHora) * 88}%` }}>
                  {h.errores > 0 && (
                    <div style={{ flex: `${h.errores} 0 0`, minHeight: "3px", background: COLOR.rojo, borderRadius: "3px 3px 0 0" }} />
                  )}
                  {h.ok > 0 && (
                    <div style={{ flex: `${h.ok} 0 0`, background: COLOR.verdeBarra, borderRadius: h.errores ? 0 : "3px 3px 0 0" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))`, gap: "10px", marginTop: "6px" }}>
          {horas.map((h) => (
            <span key={h.hora} style={{ textAlign: "center", fontSize: "12px", color: COLOR.gris, fontFamily: "'DM Mono', monospace" }}>
              {h.hora}h
            </span>
          ))}
        </div>
        <Nota>
          Incluye los escaneos de cajas, de alistamiento y de verificación
          {resp.periodo === "hoy" ? "" : ", sumando todos los días del periodo"}. Hora local de la bodega.
        </Nota>
      </Tarjeta>
    </div>
  );
}

const th = { padding: "8px 10px", borderBottom: `1px solid ${COLOR.borde}` };
const td = { padding: "10px", borderBottom: `1px solid ${COLOR.bordeSuave}` };
