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

module.exports = { kpis };
