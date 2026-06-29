const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

// KPIs de gerencia: estado de pedidos, productividad por operario, alertas de
// quiebre/sobrestock y contadores de pendientes. Agrega en memoria (el volumen
// de una bodega lo permite). Resiliente: si una tabla de Fase 5 aún no existe,
// su contador queda en 0 en vez de fallar.
const kpis = async (req, res) => {
  const bajo = Number.isFinite(Number(req.query.bajo)) ? Number(req.query.bajo) : 5;
  const alto = Number(req.query.alto) > 0 ? Number(req.query.alto) : 1000;

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("estado, prioridad, facturado, operario_id");
  if (error) return sendServerError(res, error, req);

  const porEstado = {};
  let urgentes = 0;
  let facturados = 0;
  const prodMap = {};
  for (const p of pedidos || []) {
    porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
    if (
      p.prioridad === "urgente" &&
      !["despachado", "cerrado", "verificado"].includes(p.estado)
    )
      urgentes++;
    if (p.facturado) {
      facturados++;
      if (p.operario_id)
        prodMap[p.operario_id] = (prodMap[p.operario_id] || 0) + 1;
    }
  }

  // Inventario: disponible total por producto.
  const { data: inv } = await supabase
    .from("inventario")
    .select("producto_id, cantidad_disponible");
  const dispPorProd = {};
  let totalUnidades = 0;
  for (const r of inv || []) {
    const d = r.cantidad_disponible || 0;
    dispPorProd[r.producto_id] = (dispPorProd[r.producto_id] || 0) + d;
    totalUnidades += d;
  }
  const refsConStock = Object.values(dispPorProd).filter((v) => v > 0).length;
  const quiebreIds = Object.entries(dispPorProd)
    .filter(([, v]) => v <= bajo)
    .map(([id]) => id);
  const sobreIds = Object.entries(dispPorProd)
    .filter(([, v]) => v >= alto)
    .map(([id]) => id);

  // Info de productos para quiebres/sobrestock/productividad (acotada).
  const idsInfo = [
    ...new Set([
      ...quiebreIds.slice(0, 100),
      ...sobreIds.slice(0, 100),
    ]),
  ];
  let prodInfo = {};
  if (idsInfo.length > 0) {
    const { data: ps } = await supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", idsInfo);
    prodInfo = Object.fromEntries((ps || []).map((p) => [p.id, p]));
  }

  const opIds = Object.keys(prodMap);
  let opNames = {};
  if (opIds.length > 0) {
    const { data: us } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", opIds);
    opNames = Object.fromEntries((us || []).map((u) => [u.id, u.nombre]));
  }

  const mapProd = (id) => ({
    producto_id: id,
    codigo: prodInfo[id]?.codigo_interno || null,
    descripcion: prodInfo[id]?.descripcion_corta || null,
    disponible: dispPorProd[id],
  });
  const quiebres = quiebreIds.slice(0, 50).map(mapProd);
  const sobrestock = sobreIds.slice(0, 50).map(mapProd);
  const productividad = opIds
    .map((id) => ({ operario: opNames[id] || "—", completados: prodMap[id] }))
    .sort((a, b) => b.completados - a.completados);

  // Contadores de pendientes (tolerantes a tablas inexistentes).
  const [aj, tr, co] = await Promise.all([
    supabase
      .from("ajustes_inventario")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente"),
    supabase
      .from("traslados")
      .select("id", { count: "exact", head: true })
      .eq("estado", "en_transito"),
    supabase
      .from("mini_conteos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente"),
  ]);

  return res.json({
    generado_en: new Date().toISOString(),
    pedidos: {
      total: (pedidos || []).length,
      por_estado: porEstado,
      urgentes_activos: urgentes,
      facturados,
    },
    productividad,
    inventario: {
      referencias_con_stock: refsConStock,
      total_unidades: totalUnidades,
      umbral_bajo: bajo,
      umbral_alto: alto,
      quiebres_total: quiebreIds.length,
      sobrestock_total: sobreIds.length,
    },
    quiebres,
    sobrestock,
    pendientes: {
      ajustes: aj?.count || 0,
      traslados_en_transito: tr?.count || 0,
      conteos: co?.count || 0,
    },
  });
};

// Listas para los selectores de los reportes (bodegas y usuarios activos).
const filtros = async (req, res) => {
  const [bodegas, usuarios] = await Promise.all([
    supabase.from("bodegas").select("id, codigo, nombre").order("codigo"),
    supabase
      .from("usuarios")
      .select("id, nombre, rol")
      .eq("activo", true)
      .order("nombre"),
  ]);
  return res.json({
    bodegas: bodegas.data || [],
    operarios: usuarios.data || [],
  });
};

// Movimientos de inventario (desde la bitácora) filtrables por período, bodega y
// operario, para exportar a Excel. Agrega en memoria (volumen de una bodega).
// Acota a 5000 filas e informa si quedó truncado.
const TOPE_MOVS = 5000;
const movimientos = async (req, res) => {
  const { desde, hasta, bodega_id, operario_id } = req.query;

  let q = supabase
    .from("bitacora")
    .select(
      "usuario_id, accion, tabla, registro_id, valores_antes, valores_despues, created_at",
    )
    .eq("tabla", "inventario")
    .order("created_at", { ascending: false })
    .limit(TOPE_MOVS);
  if (desde) q = q.gte("created_at", desde);
  if (hasta) q = q.lte("created_at", hasta);
  if (operario_id) q = q.eq("usuario_id", operario_id);

  const { data, error } = await q;
  if (error) return sendServerError(res, error, req);
  const rows = data || [];

  const userIds = [...new Set(rows.map((r) => r.usuario_id).filter(Boolean))];
  const prodIds = [...new Set(rows.map((r) => r.registro_id).filter(Boolean))];
  const [usuarios, productos, bodegas, ubicaciones] = await Promise.all([
    userIds.length
      ? supabase.from("usuarios").select("id, nombre").in("id", userIds)
      : { data: [] },
    prodIds.length
      ? supabase
          .from("productos")
          .select("id, codigo_interno, descripcion_corta")
          .in("id", prodIds)
      : { data: [] },
    supabase.from("bodegas").select("id, codigo"),
    supabase.from("ubicaciones").select("id, bodega_id"),
  ]);
  const uMap = Object.fromEntries((usuarios.data || []).map((u) => [u.id, u.nombre]));
  const pMap = Object.fromEntries((productos.data || []).map((p) => [p.id, p]));
  const bMap = Object.fromEntries((bodegas.data || []).map((b) => [b.id, b.codigo]));
  const ubMap = Object.fromEntries(
    (ubicaciones.data || []).map((x) => [x.id, x.bodega_id]),
  );

  const salida = rows
    .map((r) => {
      const vd = r.valores_despues || {};
      const va = r.valores_antes || {};
      // La bodega puede venir directa (recepción/saldos) o vía ubicación (picking).
      const bId =
        vd.bodega_id ||
        ubMap[vd.ubicacion_id] ||
        va.bodega_id ||
        ubMap[va.ubicacion_id] ||
        null;
      const p = pMap[r.registro_id];
      return {
        bodega_id: bId,
        fecha: r.created_at,
        usuario: uMap[r.usuario_id] || "—",
        accion: r.accion,
        referencia: p?.codigo_interno || vd.referencia || "—",
        producto: p?.descripcion_corta || vd.producto || "—",
        bodega: bId ? bMap[bId] || "—" : "—",
        antes: va.cantidad_disponible ?? null,
        despues: vd.cantidad_disponible ?? null,
      };
    })
    .filter((r) => !bodega_id || r.bodega_id === bodega_id);

  return res.json({
    total: salida.length,
    truncado: rows.length >= TOPE_MOVS,
    // eslint-disable-next-line no-unused-vars
    movimientos: salida.map(({ bodega_id: _omit, ...r }) => r),
  });
};

// Genera alertas proactivas de quiebre (stock bajo) y sobrestock: crea
// notificaciones para los roles inventarios y gerente_logistico. Deduplicado por
// día (no re-notifica el mismo producto+tipo si ya se alertó hoy), de modo que se
// puede invocar manualmente o agendar (cron) sin spamear. Tope de 100 productos
// por tipo (los más críticos).
const generarAlertasInventario = async (req, res) => {
  const bajo = Number.isFinite(Number(req.query.bajo)) ? Number(req.query.bajo) : 5;
  const alto = Number(req.query.alto) > 0 ? Number(req.query.alto) : 1000;

  const { data: inv, error } = await supabase
    .from("inventario")
    .select("producto_id, cantidad_disponible");
  if (error) return sendServerError(res, error, req);

  const disp = {};
  for (const r of inv || [])
    disp[r.producto_id] = (disp[r.producto_id] || 0) + (r.cantidad_disponible || 0);

  const quiebre = Object.entries(disp)
    .filter(([, v]) => v <= bajo)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 100);
  const sobre = Object.entries(disp)
    .filter(([, v]) => v >= alto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  const { data: dest } = await supabase
    .from("usuarios")
    .select("id")
    .in("rol", ["inventarios", "gerente_logistico"])
    .eq("activo", true);
  const destinatarios = (dest || []).map((u) => u.id);
  if (destinatarios.length === 0)
    return res.json({
      generadas: 0,
      mensaje: "No hay destinatarios activos (inventarios / gerente_logistico)",
    });

  // Dedup: alertas del mismo tipo+producto ya creadas hoy.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const { data: existentes } = await supabase
    .from("notificaciones")
    .select("tipo, datos")
    .in("tipo", ["alerta_quiebre", "alerta_sobrestock"])
    .gte("created_at", hoy.toISOString());
  const yaAlertado = new Set(
    (existentes || []).map((n) => `${n.tipo}:${n.datos?.producto_id}`),
  );

  const ids = [
    ...new Set([...quiebre.map(([id]) => id), ...sobre.map(([id]) => id)]),
  ];
  let pInfo = {};
  if (ids.length > 0) {
    const { data: ps } = await supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", ids);
    pInfo = Object.fromEntries((ps || []).map((p) => [p.id, p]));
  }

  const inserts = [];
  let nuevosQuiebre = 0;
  let nuevosSobre = 0;
  for (const [id, v] of quiebre) {
    if (yaAlertado.has(`alerta_quiebre:${id}`)) continue;
    nuevosQuiebre++;
    for (const uid of destinatarios)
      inserts.push({
        usuario_id: uid,
        tipo: "alerta_quiebre",
        titulo: "Quiebre de stock",
        mensaje: `${pInfo[id]?.codigo_interno || id} (${pInfo[id]?.descripcion_corta || "—"}) en quiebre: ${v} und disponibles`,
        datos: { producto_id: id, disponible: v, umbral_bajo: bajo },
      });
  }
  for (const [id, v] of sobre) {
    if (yaAlertado.has(`alerta_sobrestock:${id}`)) continue;
    nuevosSobre++;
    for (const uid of destinatarios)
      inserts.push({
        usuario_id: uid,
        tipo: "alerta_sobrestock",
        titulo: "Sobrestock",
        mensaje: `${pInfo[id]?.codigo_interno || id} (${pInfo[id]?.descripcion_corta || "—"}) en sobrestock: ${v} und`,
        datos: { producto_id: id, disponible: v, umbral_alto: alto },
      });
  }

  for (let i = 0; i < inserts.length; i += 500)
    await supabase.from("notificaciones").insert(inserts.slice(i, i + 500));

  return res.json({
    generadas: inserts.length,
    productos_quiebre_nuevos: nuevosQuiebre,
    productos_sobrestock_nuevos: nuevosSobre,
    destinatarios: destinatarios.length,
    omitidos_ya_alertados_hoy:
      quiebre.length - nuevosQuiebre + (sobre.length - nuevosSobre),
  });
};

module.exports = { kpis, filtros, movimientos, generarAlertasInventario };
