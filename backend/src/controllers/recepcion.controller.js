const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { toFiniteNumber } = require("../utils/validate");

const crearRecepcion = async (req, res) => {
  const { bodega_id, proveedor, numero_oc } = req.body;

  if (!bodega_id || !proveedor) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  const { data: recepcion, error } = await supabase
    .from("recepciones")
    .insert({ bodega_id, proveedor, numero_oc, estado: "en_proceso" })
    .select()
    .single();

  if (error) return sendServerError(res, error, req);

  return res.json({ recepcion, mensaje: "Recepción creada correctamente" });
};

const obtenerRecepciones = async (req, res) => {
  const { bodega_id } = req.query;

  let query = supabase
    .from("recepciones")
    .select(
      "*, recepcion_items(*, productos(codigo_interno, descripcion_corta, codigo_barras))",
    )
    .order("created_at", { ascending: false });

  // Aislamiento por bodega: un jefe_bodega solo ve recepciones de su bodega
  // (no se confía en el bodega_id del query). El administrador ve todas.
  if (req.usuario?.rol !== "administrador") {
    query = query.eq("bodega_id", req.usuario?.bodega_id || null);
  } else if (bodega_id) {
    query = query.eq("bodega_id", bodega_id);
  }

  const { data, error } = await query;

  if (error) return sendServerError(res, error, req);

  return res.json(data);
};

const obtenerRecepcion = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("recepciones")
    .select(
      "*, recepcion_items(*, productos(codigo_interno, descripcion_corta, codigo_barras, unidad_base))",
    )
    .eq("id", id)
    .single();

  if (error) return sendServerError(res, error, req);
  if (!data)
    return res.status(404).json({ error: "Recepción no encontrada" });

  // Aislamiento por bodega: el jefe_bodega solo accede a su propia bodega.
  if (
    req.usuario?.rol !== "administrador" &&
    data.bodega_id !== req.usuario?.bodega_id
  ) {
    return res.status(403).json({ error: "Esta recepción no es de tu bodega" });
  }

  return res.json(data);
};

const registrarCantidad = async (req, res) => {
  const { item_id } = req.params;
  const cantidad_recibida = toFiniteNumber(req.body.cantidad_recibida);

  if (cantidad_recibida === null || cantidad_recibida < 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const { data, error } = await supabase
    .from("recepcion_items")
    .update({ cantidad_recibida, estado: "recibido" })
    .eq("id", item_id)
    .select()
    .single();

  if (error) return sendServerError(res, error, req);

  return res.json({ data, mensaje: "Cantidad registrada" });
};

const inspeccionarItem = async (req, res) => {
  const { item_id } = req.params;
  const {
    estado_inspeccion,
    cantidad_aprobada,
    cantidad_rechazada,
    motivo_rechazo,
  } = req.body;

  const estadosValidos = ["aprobado", "rechazado", "parcial", "cuarentena"];
  if (!estadosValidos.includes(estado_inspeccion)) {
    return res.status(400).json({ error: "Estado de inspección inválido" });
  }

  // Las cantidades son opcionales, pero si vienen deben ser números >= 0.
  const aprobada = toFiniteNumber(cantidad_aprobada);
  const rechazada = toFiniteNumber(cantidad_rechazada);
  const aprobadaProvista = cantidad_aprobada != null && cantidad_aprobada !== "";
  const rechazadaProvista =
    cantidad_rechazada != null && cantidad_rechazada !== "";
  if (
    (aprobadaProvista && (aprobada === null || aprobada < 0)) ||
    (rechazadaProvista && (rechazada === null || rechazada < 0))
  ) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const { data, error } = await supabase
    .from("recepcion_items")
    .update({
      estado: estado_inspeccion,
      cantidad_aprobada: aprobada,
      cantidad_rechazada: rechazada,
      motivo_rechazo,
    })
    .eq("id", item_id)
    .select()
    .single();

  if (error) return sendServerError(res, error, req);

  return res.json({ data, mensaje: "Inspección registrada" });
};

const confirmarRecepcion = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  // Suma de inventario por ítem aprobado + bitácora + cierre de la recepción en
  // UNA transacción con bloqueo (idempotente, evita doble suma de inventario).
  // Ver backend/sql/2026-06-01_rpc_recepciones.sql
  const { data, error } = await supabase.rpc("confirmar_recepcion", {
    p_recepcion_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Recepción no encontrada" });
    case "already_done":
      return res.status(400).json({ error: "La recepción ya fue confirmada" });
    case "items_sin_inspeccionar":
      return res.status(400).json({ error: "Hay ítems sin inspeccionar" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({ mensaje: "Recepción confirmada e inventario actualizado" });
};

const agregarItemRecepcion = async (req, res) => {
  const { id } = req.params;
  const { producto_id, cantidad_recibida } = req.body;

  const { data: recepcion } = await supabase
    .from("recepciones")
    .select("bodega_id")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("recepcion_items")
    .insert({
      recepcion_id: id,
      producto_id,
      cantidad_esperada: cantidad_recibida,
      cantidad_recibida,
      cantidad_aprobada: cantidad_recibida,
      estado: "aprobado",
      bodega_id: recepcion?.bodega_id,
    })
    .select()
    .single();

  if (error) return sendServerError(res, error, req);

  return res.json(data);
};

const confirmarRecepcionDirecto = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  // Igual que confirmarRecepcion pero suma todos los ítems por cantidad_recibida
  // (sin inspección). Transaccional e idempotente.
  const { data, error } = await supabase.rpc("confirmar_recepcion_directo", {
    p_recepcion_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Recepción no encontrada" });
    case "already_done":
      return res.status(400).json({ error: "La recepción ya fue confirmada" });
    case "sin_items":
      return res
        .status(400)
        .json({ error: "No hay productos en esta recepción" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({ mensaje: "Recepción confirmada e inventario actualizado" });
};

module.exports = {
  crearRecepcion,
  obtenerRecepciones,
  obtenerRecepcion,
  registrarCantidad,
  inspeccionarItem,
  confirmarRecepcion,
  agregarItemRecepcion,
  confirmarRecepcionDirecto,
};
