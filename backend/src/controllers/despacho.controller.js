const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { toFiniteNumber } = require("../utils/validate");

// Pedidos verificados que esperan despacho físico (registro de bultos/peso).
// Aislamiento por bodega igual que en verificación.
const listarPorDespachar = async (req, res) => {
  const { rol, bodega_id } = req.usuario || {};

  let query = supabase
    .from("pedidos")
    .select("*, pedido_items(*, productos(codigo_interno, descripcion_corta))")
    .eq("estado", "verificado")
    .order("hora_verificacion", { ascending: true });

  if (rol === "jefe_bodega" && bodega_id) {
    query = query.or(`bodega_id.eq.${bodega_id},bodega_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

const detalleDespacho = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("pedidos")
    .select("*, pedido_items(*, productos(codigo_interno, descripcion_corta))")
    .eq("id", id)
    .single();
  if (error || !data)
    return res.status(404).json({ error: "Pedido no encontrado" });
  return res.json(data);
};

// Registra la salida física del pedido: bultos (obligatorio, > 0), peso opcional
// y, si es parcial, las referencias pendientes con su motivo. Pasa el pedido a
// 'despachado' y notifica a facturación. No toca inventario.
const registrarDespacho = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;
  const {
    bultos,
    peso_kg,
    observaciones,
    items_pendientes = [],
    transportadora,
    guia_transporte,
    conductor,
    placa_vehiculo,
  } = req.body || {};

  // Datos del transportista: opcionales, se guardan recortados (o null si vacío).
  const limpiar = (v) => {
    const s = String(v ?? "").trim();
    return s === "" ? null : s.slice(0, 200);
  };
  const transportadoraVal = limpiar(transportadora);
  const guiaVal = limpiar(guia_transporte);
  const conductorVal = limpiar(conductor);
  const placaVal = limpiar(placa_vehiculo);

  const bultosNum = toFiniteNumber(bultos);
  if (bultosNum === null || bultosNum <= 0 || !Number.isInteger(bultosNum)) {
    return res
      .status(400)
      .json({ error: "El número de bultos debe ser un entero mayor a 0" });
  }
  let pesoNum = null;
  if (peso_kg !== undefined && peso_kg !== null && peso_kg !== "") {
    pesoNum = toFiniteNumber(peso_kg);
    if (pesoNum === null || pesoNum < 0) {
      return res.status(400).json({ error: "Peso inválido" });
    }
  }

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero, estado, pedido_items(id)")
    .eq("id", id)
    .single();
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
  if (pedido.estado !== "verificado") {
    return res.status(400).json({
      error: "Solo se pueden despachar pedidos verificados por el jefe",
    });
  }

  // Valida que los ítems pendientes pertenezcan al pedido.
  const idsPedido = new Set((pedido.pedido_items || []).map((i) => i.id));
  const pendientes = (Array.isArray(items_pendientes) ? items_pendientes : [])
    .filter((p) => p && idsPedido.has(p.item_id))
    .map((p) => ({ item_id: p.item_id, motivo: (p.motivo || "").trim() }));
  if (pendientes.some((p) => !p.motivo)) {
    return res.status(400).json({
      error: "Cada referencia pendiente requiere un motivo",
    });
  }
  const esParcial = pendientes.length > 0;

  // Marca las referencias pendientes (despacho parcial).
  for (const p of pendientes) {
    await supabase
      .from("pedido_items")
      .update({ pendiente_despacho: true, motivo_pendiente: p.motivo })
      .eq("id", p.item_id);
  }

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("pedidos")
    .update({
      estado: "despachado",
      bultos: bultosNum,
      peso_kg: pesoNum,
      despacho_parcial: esParcial,
      observaciones_despacho: (observaciones || "").trim() || null,
      transportadora: transportadoraVal,
      guia_transporte: guiaVal,
      conductor: conductorVal,
      placa_vehiculo: placaVal,
      hora_despacho: ahora,
      despachado_por: usuario_id,
    })
    .eq("id", id);
  if (error) return sendServerError(res, error, req);

  // Notifica a facturación: el pedido salió y está listo para facturar.
  const { data: facturadores } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "facturacion")
    .eq("activo", true);
  if (facturadores && facturadores.length > 0) {
    await supabase.from("notificaciones").insert(
      facturadores.map((f) => ({
        usuario_id: f.id,
        tipo: "pedido_despachado",
        titulo: "Pedido despachado",
        mensaje: `El pedido ${pedido.numero} fue despachado${esParcial ? " (parcial)" : ""} y está listo para facturar`,
        datos: { pedido_id: id, pedido_numero: pedido.numero },
      })),
    );
  }

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "DESPACHO_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: "verificado" },
    valores_despues: {
      estado: "despachado",
      pedido_numero: pedido.numero,
      bultos: bultosNum,
      peso_kg: pesoNum,
      despacho_parcial: esParcial,
      items_pendientes: pendientes,
      transportadora: transportadoraVal,
      guia_transporte: guiaVal,
      conductor: conductorVal,
      placa_vehiculo: placaVal,
    },
  });

  return res.json({
    mensaje: esParcial
      ? `Pedido despachado parcialmente (${pendientes.length} pendiente(s))`
      : "Pedido despachado y enviado a facturación",
  });
};

module.exports = {
  listarPorDespachar,
  detalleDespacho,
  registrarDespacho,
};
