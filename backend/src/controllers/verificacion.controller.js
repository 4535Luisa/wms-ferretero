const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { verificarYRegistrar, normalizarRef } = require("../utils/escaneo");

// Pedidos cerrados por el operario que esperan verificación física del jefe de
// bodega antes de pasar a facturación. Aislamiento por bodega: un jefe con
// bodega asignada ve los de su bodega (y los que no tienen bodega definida).
const listarPorVerificar = async (req, res) => {
  const { rol, bodega_id } = req.usuario || {};

  let query = supabase
    .from("pedidos")
    .select("*, pedido_items(*, productos(codigo_interno, descripcion_corta))")
    .eq("estado", "cerrado")
    .order("hora_cierre", { ascending: true });

  if (rol === "jefe_bodega" && bodega_id) {
    query = query.or(`bodega_id.eq.${bodega_id},bodega_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

// Detalle de un pedido para verificar, con el estado de verificación por ítem.
const detalleVerificacion = async (req, res) => {
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

// El jefe escanea la caja/referencia de un ítem. Si coincide con la esperada,
// el ítem queda verificado. NO toca inventario (ya se descontó en el picking de
// Fase 3): solo confirma físicamente y deja traza en bitácora (vía escaneo).
const verificarItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { referencia_escaneada } = req.body || {};
  const usuario_id = req.usuario?.id;

  const { data: item } = await supabase
    .from("pedido_items")
    .select("id, pedido_id, productos(codigo_interno), pedidos(estado)")
    .eq("id", itemId)
    .eq("pedido_id", id)
    .single();
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

  // Solo se verifica dentro de la ventana de verificación (pedido cerrado). Evita
  // marcar ítems de un pedido ya verificado/despachado/facturado.
  if (item.pedidos?.estado !== "cerrado") {
    return res.status(400).json({
      error: "Solo se pueden verificar pedidos cerrados pendientes de verificación",
    });
  }

  // Verificación de escaneo (railguard): la referencia escaneada debe coincidir
  // con la del producto. El intento (éxito o error) queda registrado en bitácora.
  const refEsperada = item.productos?.codigo_interno;
  const { ok, resultado } = await verificarYRegistrar({
    usuario_id,
    tabla: "pedido_items",
    registro_id: itemId,
    esperada: refEsperada,
    escaneada: referencia_escaneada,
  });
  if (!ok) {
    return res.status(422).json({
      error:
        resultado === "faltante"
          ? "Debes escanear la caja para verificarla"
          : `Referencia incorrecta: escaneaste ${normalizarRef(referencia_escaneada)}, pero este ítem es ${refEsperada}`,
      resultado,
      referencia_esperada: refEsperada,
    });
  }

  await supabase
    .from("pedido_items")
    .update({ verificado: true })
    .eq("id", itemId);

  // Progreso de la verificación del pedido.
  const { data: items } = await supabase
    .from("pedido_items")
    .select("verificado")
    .eq("pedido_id", id);
  const total = (items || []).length;
  const verificados = (items || []).filter((i) => i.verificado).length;

  return res.json({ mensaje: "Ítem verificado", verificados, total });
};

// Confirma la verificación completa: exige que TODOS los ítems estén
// verificados. Pasa el pedido a 'verificado' y notifica a facturación.
const confirmarVerificacion = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero, estado, pedido_items(id, verificado)")
    .eq("id", id)
    .single();
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
  if (pedido.estado !== "cerrado") {
    return res.status(400).json({
      error: "Solo se pueden verificar pedidos cerrados por el operario",
    });
  }

  const items = pedido.pedido_items || [];
  const pendientes = items.filter((i) => !i.verificado);
  if (items.length === 0 || pendientes.length > 0) {
    return res.status(400).json({
      error: `Faltan ${pendientes.length} referencia(s) por escanear`,
    });
  }

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("pedidos")
    .update({
      estado: "verificado",
      hora_verificacion: ahora,
      verificado_por: usuario_id,
    })
    .eq("id", id);
  if (error) return sendServerError(res, error, req);

  // Notifica a los jefes de bodega: el pedido quedó verificado y listo para el
  // despacho físico (registro de bultos/peso).
  const { data: jefes } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "jefe_bodega")
    .eq("activo", true);
  if (jefes && jefes.length > 0) {
    await supabase.from("notificaciones").insert(
      jefes.map((j) => ({
        usuario_id: j.id,
        tipo: "pedido_por_despachar",
        titulo: "Pedido por despachar",
        mensaje: `El pedido ${pedido.numero} fue verificado y está listo para despachar`,
        datos: { pedido_id: id, pedido_numero: pedido.numero },
      })),
    );
  }

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "VERIFICACION_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: "cerrado" },
    valores_despues: { estado: "verificado", pedido_numero: pedido.numero },
  });

  return res.json({ mensaje: "Pedido verificado y enviado a despacho" });
};

module.exports = {
  listarPorVerificar,
  detalleVerificacion,
  verificarItem,
  confirmarVerificacion,
};
