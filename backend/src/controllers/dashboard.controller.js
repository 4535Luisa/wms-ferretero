const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

// Resumen en vivo para el panel admin: estado de pedidos, listas de picking,
// progreso de cajas, cola de saldos y carga por operario. Agrega en memoria
// (Supabase no hace GROUP BY cómodo desde el cliente); el volumen de una bodega
// lo permite sin problema.
const ESTADOS_ACTIVOS = ["asignado", "en_proceso", "en_picking"];

const resumen = async (req, res) => {
  const { data: pedidos, error: e1 } = await supabase
    .from("pedidos")
    .select("estado, prioridad, facturado, operario_id");
  if (e1) return sendServerError(res, e1, req);

  const pedidosPorEstado = {};
  let urgentesActivos = 0;
  const cargaPorOperario = {};
  for (const p of pedidos || []) {
    pedidosPorEstado[p.estado] = (pedidosPorEstado[p.estado] || 0) + 1;
    if (p.prioridad === "urgente" && !["despachado", "cerrado"].includes(p.estado))
      urgentesActivos++;
    if (p.operario_id && ESTADOS_ACTIVOS.includes(p.estado))
      cargaPorOperario[p.operario_id] =
        (cargaPorOperario[p.operario_id] || 0) + 1;
  }

  const { data: listas } = await supabase
    .from("listas_picking")
    .select("estado");
  const listasPorEstado = {};
  for (const l of listas || [])
    listasPorEstado[l.estado] = (listasPorEstado[l.estado] || 0) + 1;

  const { data: cajas } = await supabase
    .from("lista_picking_items")
    .select("estado, destino_saldos");
  let cajasTotal = 0;
  let cajasBajadas = 0;
  let entrantesSaldos = 0;
  for (const c of cajas || []) {
    cajasTotal++;
    if (c.estado && c.estado !== "pendiente") cajasBajadas++;
    if (c.destino_saldos && c.estado === "bajada") entrantesSaldos++;
  }

  const { data: saldos } = await supabase
    .from("saldos")
    .select("estado")
    .neq("estado", "entregado");
  const saldosCola = (saldos || []).length;

  const opIds = Object.keys(cargaPorOperario);
  let operariosCarga = [];
  if (opIds.length > 0) {
    const { data: us } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", opIds);
    const mapa = Object.fromEntries((us || []).map((u) => [u.id, u.nombre]));
    operariosCarga = opIds
      .map((id) => ({
        id,
        nombre: mapa[id] || "—",
        pedidos_activos: cargaPorOperario[id],
      }))
      .sort((a, b) => b.pedidos_activos - a.pedidos_activos);
  }

  return res.json({
    generado_en: new Date().toISOString(),
    pedidos: {
      total: (pedidos || []).length,
      por_estado: pedidosPorEstado,
      urgentes_activos: urgentesActivos,
    },
    picking: {
      listas_por_estado: listasPorEstado,
      cajas_total: cajasTotal,
      cajas_bajadas: cajasBajadas,
      progreso_pct: cajasTotal
        ? Math.round((cajasBajadas / cajasTotal) * 100)
        : 0,
    },
    saldos: {
      en_cola: saldosCola,
      cajas_por_confirmar: entrantesSaldos,
    },
    operarios_carga: operariosCarga,
  });
};

module.exports = { resumen };
