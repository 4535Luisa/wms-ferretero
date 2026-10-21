const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid } = require("../utils/validate");
const {
  TZ,
  calcularPeriodo,
  ultimasSemanas,
} = require("../utils/periodos");
const { METAS, CLAVES_METAS, semaforo, generarFocos } = require("../utils/panel");

// Panel de control (administrador y gerente logístico). Todo es lectura salvo
// PUT /metas. Las cifras se agregan en Postgres (sql/2026-10-20_panel_control.sql)
// para no toparse con el límite de 1.000 filas por consulta de Supabase.

const SQL_PANEL = "sql/2026-10-20_panel_control.sql";

// Función o tabla inexistente: el SQL del panel no se ha aplicado aún.
const faltaSQL = (error) =>
  ["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code);

function responderError(res, error, req) {
  if (faltaSQL(error))
    return res.status(503).json({
      error: `Falta aplicar ${SQL_PANEL} en Supabase`,
    });
  return sendServerError(res, error, req);
}

function leerPeriodo(req, res, porDefecto) {
  const r = calcularPeriodo({
    periodo: req.query.periodo || porDefecto,
    desde: req.query.desde,
    hasta: req.query.hasta,
  });
  if (r.error) {
    res.status(400).json({ error: r.error });
    return null;
  }
  return r;
}

const periodoJSON = (p) => ({
  periodo: p.periodo,
  desde: p.desde.toISOString(),
  hasta: p.hasta.toISOString(),
  prev_desde: p.prevDesde.toISOString(),
  prev_hasta: p.prevHasta.toISOString(),
  zona_horaria: TZ,
});

async function rpc(nombre, params) {
  const { data, error } = await supabase.rpc(nombre, params);
  return { data, error };
}

// Metas guardadas; si la tabla aún no existe se usan los valores por defecto.
async function leerMetas() {
  const metas = Object.fromEntries(METAS.map((m) => [m.clave, m.porDefecto]));
  const { data, error } = await supabase
    .from("panel_metas")
    .select("clave, valor, updated_at, updated_by");
  if (error && !faltaSQL(error)) return { error };
  let actualizado = null;
  for (const fila of data || []) {
    if (!CLAVES_METAS.includes(fila.clave)) continue;
    metas[fila.clave] = Number(fila.valor);
    if (!actualizado || fila.updated_at > actualizado.updated_at)
      actualizado = fila;
  }
  return { metas, actualizado };
}

const enVivo = async (req, res) => {
  const p = leerPeriodo(req, res, "hoy");
  if (!p) return;
  const [{ data, error }, m] = await Promise.all([
    rpc("panel_en_vivo", {
      p_desde: p.desde.toISOString(),
      p_hasta: p.hasta.toISOString(),
      p_prev_desde: p.prevDesde.toISOString(),
      p_prev_hasta: p.prevHasta.toISOString(),
      p_tz: TZ,
    }),
    leerMetas(),
  ]);
  if (error) return responderError(res, error, req);
  if (m.error) return sendServerError(res, m.error, req);
  return res.json({
    ...periodoJSON(p),
    generado_en: new Date().toISOString(),
    metas: m.metas,
    datos: data,
  });
};

const operarios = async (req, res) => {
  const p = leerPeriodo(req, res, "30d");
  if (!p) return;
  const rango = {
    p_desde: p.desde.toISOString(),
    p_hasta: p.hasta.toISOString(),
    p_tz: TZ,
  };
  const [detalle, actual, anterior, m] = await Promise.all([
    rpc("panel_operarios", rango),
    rpc("panel_indicadores", rango),
    rpc("panel_indicadores", {
      p_desde: p.prevDesde.toISOString(),
      p_hasta: p.prevHasta.toISOString(),
      p_tz: TZ,
    }),
    leerMetas(),
  ]);
  const error = detalle.error || actual.error || anterior.error;
  if (error) return responderError(res, error, req);
  if (m.error) return sendServerError(res, m.error, req);
  return res.json({
    ...periodoJSON(p),
    metas: m.metas,
    indicadores: actual.data,
    indicadores_anterior: anterior.data,
    datos: detalle.data,
  });
};

const mercancia = async (req, res) => {
  const p = leerPeriodo(req, res, "30d");
  if (!p) return;
  const { bodega, familia } = req.query;
  if (bodega && !isUuid(bodega))
    return res.status(400).json({ error: "Bodega inválida" });
  const familiaTxt = typeof familia === "string" ? familia.trim() : "";
  if (familiaTxt.length > 120)
    return res.status(400).json({ error: "Familia inválida" });

  const { data, error } = await rpc("panel_mercancia", {
    p_desde: p.desde.toISOString(),
    p_hasta: p.hasta.toISOString(),
    p_bodega: bodega || null,
    p_familia: familiaTxt || null,
  });
  if (error) return responderError(res, error, req);

  const { data: bodegas, error: eb } = await supabase
    .from("bodegas")
    .select("id, codigo, nombre")
    .order("codigo");
  if (eb) return sendServerError(res, eb, req);

  return res.json({ ...periodoJSON(p), bodegas: bodegas || [], datos: data });
};

const PRIORIDADES = ["normal", "urgente"];

const flujo = async (req, res) => {
  const p = leerPeriodo(req, res, "14d");
  if (!p) return;
  const { prioridad } = req.query;
  if (prioridad && !PRIORIDADES.includes(prioridad))
    return res.status(400).json({ error: "Prioridad inválida" });

  const { data, error } = await rpc("panel_flujo", {
    p_desde: p.desde.toISOString(),
    p_hasta: p.hasta.toISOString(),
    p_tz: TZ,
    p_prioridad: prioridad || null,
  });
  if (error) return responderError(res, error, req);
  return res.json({ ...periodoJSON(p), datos: data });
};

const SEMANAS_HISTORIAL = 8;

// Metas con su valor de esta semana, las 8 últimas semanas y los focos de
// atención (calculados con la última semana completa, de lunes a domingo).
const verMetas = async (req, res) => {
  const m = await leerMetas();
  if (m.error) return sendServerError(res, m.error, req);

  // 9 semanas: la actual y las 8 anteriores (la 8.ª anterior sirve para la
  // tendencia de la semana pasada).
  const semanas = ultimasSemanas(SEMANAS_HISTORIAL + 1);
  const resultados = await Promise.all(
    semanas.map((s) =>
      rpc("panel_indicadores", {
        p_desde: s.desde.toISOString(),
        p_hasta: s.hasta.toISOString(),
        p_tz: TZ,
      }),
    ),
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo) return responderError(res, fallo.error, req);
  const porSemana = resultados.map((r) => r.data || {});

  const pasada = semanas[semanas.length - 2];
  const rango = {
    p_desde: pasada.desde.toISOString(),
    p_hasta: pasada.hasta.toISOString(),
  };
  const [ops, flu, mer] = await Promise.all([
    rpc("panel_operarios", { ...rango, p_tz: TZ }),
    rpc("panel_flujo", { ...rango, p_tz: TZ, p_prioridad: null }),
    rpc("panel_mercancia", { ...rango, p_bodega: null, p_familia: null }),
  ]);
  const error = ops.error || flu.error || mer.error;
  if (error) return responderError(res, error, req);

  const actual = porSemana[porSemana.length - 1];
  const previa = porSemana[porSemana.length - 2];
  const metas = METAS.map((def) => ({
    clave: def.clave,
    nombre: def.nombre,
    sentido: def.sentido,
    unidad: def.unidad,
    meta: m.metas[def.clave],
    actual: actual[def.clave] ?? null,
    anterior: previa[def.clave] ?? null,
    estado: semaforo(actual[def.clave], m.metas[def.clave], def.sentido),
    historial: porSemana.slice(1).map((s, i) => ({
      desde: semanas[i + 1].desde.toISOString(),
      valor: s[def.clave] ?? null,
    })),
  }));

  const focos = generarFocos({
    indicadores: previa,
    metas: m.metas,
    operarios: ops.data?.operarios,
    faltantes: flu.data?.faltantes,
    agotadas: mer.data?.agotadas_total || 0,
  });

  return res.json({
    zona_horaria: TZ,
    semana_desde: semanas[semanas.length - 1].desde.toISOString(),
    focos_desde: pasada.desde.toISOString(),
    focos_hasta: pasada.hasta.toISOString(),
    actualizado_en: m.actualizado?.updated_at || null,
    metas,
    focos,
  });
};

const guardarMetas = async (req, res) => {
  const entrada = req.body?.metas;
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada))
    return res.status(400).json({ error: "Faltan las metas" });

  const filas = [];
  for (const [clave, valor] of Object.entries(entrada)) {
    if (!CLAVES_METAS.includes(clave))
      return res.status(400).json({ error: `Meta desconocida: ${clave}` });
    const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100000)
      return res.status(400).json({ error: `Valor inválido para ${clave}` });
    filas.push({
      clave,
      valor: n,
      updated_at: new Date().toISOString(),
      updated_by: req.usuario?.id || null,
    });
  }
  if (filas.length === 0)
    return res.status(400).json({ error: "Faltan las metas" });

  const { error } = await supabase
    .from("panel_metas")
    .upsert(filas, { onConflict: "clave" });
  if (error) return responderError(res, error, req);
  return res.json({ mensaje: "Metas guardadas" });
};

// Descargas en Excel: se pagina de 1.000 en 1.000 (límite de Supabase) hasta
// un tope razonable para una hoja.
const TOPE_FILAS = 20000;
const PAGINA = 1000;

// `consulta()` debe devolver una consulta nueva, ya filtrada y ordenada.
async function leerPaginado(consulta) {
  const filas = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await consulta().range(desde, desde + PAGINA - 1);
    if (error) return { error };
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return { filas, truncado: filas.length >= TOPE_FILAS };
}

const actividad = async (req, res) => {
  const p = leerPeriodo(req, res, "semana");
  if (!p) return;
  const { filas, truncado, error } = await leerPaginado(() =>
    supabase
      .from("bitacora")
      .select("accion, tabla, valores_despues, created_at, usuarios(nombre, rol)")
      .gte("created_at", p.desde.toISOString())
      .lt("created_at", p.hasta.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
  if (error) return sendServerError(res, error, req);
  return res.json({
    ...periodoJSON(p),
    truncado,
    filas: filas.map((f) => ({
      fecha: f.created_at,
      usuario: f.usuarios?.nombre || null,
      rol: f.usuarios?.rol || null,
      accion: f.accion,
      tabla: f.tabla,
      pedido: f.valores_despues?.pedido_numero || null,
      resultado: f.valores_despues?.resultado || null,
    })),
  });
};

// Ajustes aprobados en el periodo, para la descarga en Excel.
const ajustes = async (req, res) => {
  const p = leerPeriodo(req, res, "30d");
  if (!p) return;
  const { bodega } = req.query;
  if (bodega && !isUuid(bodega))
    return res.status(400).json({ error: "Bodega inválida" });
  const { filas, truncado, error } = await leerPaginado(() => {
    let q = supabase
      .from("ajustes_inventario")
      .select(
        "tipo, sentido, cantidad, motivo, resolved_at, productos(codigo_interno, descripcion_corta), bodegas(codigo)",
      )
      .eq("estado", "aprobado")
      .gte("resolved_at", p.desde.toISOString())
      .lt("resolved_at", p.hasta.toISOString())
      .order("resolved_at", { ascending: true })
      .order("id", { ascending: true });
    if (bodega) q = q.eq("bodega_id", bodega);
    return q;
  });
  if (error) return sendServerError(res, error, req);
  return res.json({
    ...periodoJSON(p),
    truncado,
    filas: filas.map((a) => ({
      fecha: a.resolved_at,
      referencia: a.productos?.codigo_interno || null,
      descripcion: a.productos?.descripcion_corta || null,
      bodega: a.bodegas?.codigo || null,
      tipo: a.tipo,
      unidades:
        a.sentido === "incremento" ? Number(a.cantidad) : -Number(a.cantidad),
      motivo: a.motivo,
    })),
  });
};

module.exports = {
  enVivo,
  operarios,
  mercancia,
  flujo,
  verMetas,
  guardarMetas,
  actividad,
  ajustes,
};
