const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

// Adjunta nombres de solicitante/confirmador (evita N+1).
const adjuntarUsuarios = async (traslados) => {
  const ids = [
    ...new Set(
      traslados.flatMap((t) =>
        [t.solicitado_por, t.confirmado_por].filter(Boolean),
      ),
    ),
  ];
  let mapa = {};
  if (ids.length > 0) {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", ids);
    if (data) mapa = Object.fromEntries(data.map((u) => [u.id, u.nombre]));
  }
  return traslados.map((t) => ({
    ...t,
    solicitante: t.solicitado_por ? mapa[t.solicitado_por] || null : null,
    confirmador: t.confirmado_por ? mapa[t.confirmado_por] || null : null,
  }));
};

// Crea un traslado: descuenta del origen (RPC atómica) y lo deja en tránsito.
const crearTraslado = async (req, res) => {
  const usuario_id = req.usuario?.id || null;
  const {
    producto_id,
    bodega_origen_id,
    bodega_destino_id,
    ubicacion_origen_id,
    cantidad,
    motivo,
  } = req.body || {};

  if (!isUuid(producto_id))
    return res.status(400).json({ error: "Producto inválido" });
  if (!isUuid(bodega_origen_id) || !isUuid(bodega_destino_id))
    return res.status(400).json({ error: "Bodega inválida" });
  if (bodega_origen_id === bodega_destino_id)
    return res
      .status(400)
      .json({ error: "El origen y el destino deben ser distintos" });
  if (ubicacion_origen_id && !isUuid(ubicacion_origen_id))
    return res.status(400).json({ error: "Ubicación inválida" });
  const cant = toFiniteNumber(cantidad);
  if (cant === null || cant <= 0)
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });

  const { data, error } = await supabase.rpc("crear_traslado", {
    p_producto_id: producto_id,
    p_bodega_origen: bodega_origen_id,
    p_bodega_destino: bodega_destino_id,
    p_ubicacion_origen: ubicacion_origen_id || null,
    p_cantidad: cant,
    p_motivo: motivo || null,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "insufficient":
      return res.status(400).json({
        error: `Stock insuficiente en el origen (disponible: ${r.disponible})`,
      });
    case "same_bodega":
      return res
        .status(400)
        .json({ error: "El origen y el destino deben ser distintos" });
    case "invalid":
      return res.status(400).json({ error: "Datos del traslado inválidos" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({
    mensaje: "Traslado enviado — pendiente de confirmar en destino",
    traslado_id: r.traslado_id,
  });
};

// Lista los traslados (opcionalmente por estado) con producto y bodegas.
const listarTraslados = async (req, res) => {
  const { estado } = req.query;

  let query = supabase
    .from("traslados")
    .select(
      "*, productos(codigo_interno, descripcion_corta), origen:bodega_origen_id(codigo, nombre), destino:bodega_destino_id(codigo, nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  // Si la relación nombrada no resuelve (FKs sin nombrar en PostgREST), reintenta
  // sin el join de bodegas para no romper la vista.
  if (error) {
    const { data: plano, error: e2 } = await supabase
      .from("traslados")
      .select("*, productos(codigo_interno, descripcion_corta)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (e2) return sendServerError(res, e2, req);
    return res.json(await adjuntarUsuarios(plano || []));
  }

  return res.json(await adjuntarUsuarios(data || []));
};

// Confirma la recepción en destino: suma al inventario destino (RPC atómica).
const confirmarTraslado = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data, error } = await supabase.rpc("confirmar_traslado", {
    p_traslado_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Traslado no encontrado" });
    case "already_done":
      return res
        .status(400)
        .json({ error: "El traslado ya fue confirmado o cancelado" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({ mensaje: "Traslado confirmado en destino" });
};

// Cancela un traslado en tránsito: devuelve el stock al origen (RPC atómica).
const cancelarTraslado = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data, error } = await supabase.rpc("cancelar_traslado", {
    p_traslado_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Traslado no encontrado" });
    case "already_done":
      return res
        .status(400)
        .json({ error: "El traslado ya fue confirmado o cancelado" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({ mensaje: "Traslado cancelado — stock devuelto al origen" });
};

module.exports = {
  crearTraslado,
  listarTraslados,
  confirmarTraslado,
  cancelarTraslado,
};
