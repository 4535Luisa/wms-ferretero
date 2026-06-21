const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

// Lista las notificaciones del usuario autenticado (más recientes primero) y el
// conteo total de no leídas. ?solo_no_leidas=1 limita la lista a las pendientes;
// ?limit acota el tamaño (máx. 100, por defecto 30).
const listarNotificaciones = async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: "No autenticado" });

  const limit = Math.min(Number(req.query.limit) || 30, 100);

  let query = supabase
    .from("notificaciones")
    .select("id, tipo, titulo, mensaje, leida, datos, created_at")
    .eq("usuario_id", usuario_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  // "No leída" = leida false O NULL (las filas creadas antes de normalizar la
  // columna no tenían valor; se cuentan como pendientes).
  if (req.query.solo_no_leidas === "1")
    query = query.or("leida.is.null,leida.eq.false");

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);

  // Conteo de no leídas, independiente del limit/filtro de la lista (para el
  // badge de la campana).
  const { count } = await supabase
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario_id)
    .or("leida.is.null,leida.eq.false");

  return res.json({ notificaciones: data || [], no_leidas: count || 0 });
};

// Marca UNA notificación como leída. El filtro por usuario_id impide marcar las
// de otros usuarios (un id ajeno no coincide y devuelve 404).
const marcarLeida = async (req, res) => {
  const usuario_id = req.usuario?.id;
  const { id } = req.params;

  const { data, error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("id", id)
    .eq("usuario_id", usuario_id)
    .select("id")
    .maybeSingle();
  if (error) return sendServerError(res, error, req);
  if (!data)
    return res.status(404).json({ error: "Notificación no encontrada" });

  return res.json({ mensaje: "Notificación marcada como leída" });
};

// Marca TODAS las notificaciones no leídas del usuario como leídas.
const marcarTodasLeidas = async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: "No autenticado" });

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("usuario_id", usuario_id)
    .or("leida.is.null,leida.eq.false");
  if (error) return sendServerError(res, error, req);

  return res.json({ mensaje: "Todas las notificaciones marcadas como leídas" });
};

module.exports = { listarNotificaciones, marcarLeida, marcarTodasLeidas };
