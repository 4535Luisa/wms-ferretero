const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

const TIPOS = ["averia", "perdida", "sobrante", "error", "merma", "correccion"];
const SENTIDOS = ["incremento", "decremento"];

// Adjunta nombres de solicitante/aprobador a una lista de ajustes (evita N+1).
const adjuntarUsuarios = async (ajustes) => {
  const ids = [
    ...new Set(
      ajustes.flatMap((a) =>
        [a.solicitado_por, a.aprobado_por].filter(Boolean),
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
  return ajustes.map((a) => ({
    ...a,
    solicitante: a.solicitado_por ? mapa[a.solicitado_por] || null : null,
    aprobador: a.aprobado_por ? mapa[a.aprobado_por] || null : null,
  }));
};

// El rol "inventarios" registra un ajuste, que queda PENDIENTE de aprobación.
const crearAjuste = async (req, res) => {
  const usuario_id = req.usuario?.id || null;
  const { producto_id, bodega_id, ubicacion_id, tipo, sentido, cantidad, motivo } =
    req.body || {};

  if (!isUuid(producto_id))
    return res.status(400).json({ error: "Producto inválido" });
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });
  if (ubicacion_id && !isUuid(ubicacion_id))
    return res.status(400).json({ error: "Ubicación inválida" });
  if (!TIPOS.includes(tipo))
    return res.status(400).json({ error: "Tipo de ajuste inválido" });
  if (!SENTIDOS.includes(sentido))
    return res.status(400).json({ error: "Sentido inválido" });
  const cant = toFiniteNumber(cantidad);
  if (cant === null || cant <= 0)
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
  if (!motivo?.trim())
    return res.status(400).json({ error: "El motivo es obligatorio" });

  const { data, error } = await supabase
    .from("ajustes_inventario")
    .insert({
      producto_id,
      bodega_id,
      ubicacion_id: ubicacion_id || null,
      tipo,
      sentido,
      cantidad: cant,
      motivo: motivo.trim(),
      estado: "pendiente",
      solicitado_por: usuario_id,
    })
    .select()
    .single();
  if (error) return sendServerError(res, error, req);

  // Notifica a los gerentes logísticos que hay un ajuste por aprobar.
  const { data: gerentes } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "gerente_logistico")
    .eq("activo", true);
  if (gerentes && gerentes.length > 0) {
    await supabase.from("notificaciones").insert(
      gerentes.map((g) => ({
        usuario_id: g.id,
        tipo: "ajuste_pendiente",
        titulo: "Ajuste de inventario por aprobar",
        mensaje: `Hay un ajuste (${tipo}) pendiente de tu aprobación`,
        datos: { ajuste_id: data.id },
      })),
    );
  }

  return res.json({ data, mensaje: "Ajuste registrado, pendiente de aprobación" });
};

// Lista los ajustes (opcionalmente filtrados por estado) con producto y bodega.
const listarAjustes = async (req, res) => {
  const { estado } = req.query;

  let query = supabase
    .from("ajustes_inventario")
    .select(
      "*, productos(codigo_interno, descripcion_corta), bodegas(codigo, nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);

  return res.json(await adjuntarUsuarios(data || []));
};

// El gerente aprueba: la RPC aplica el ajuste de forma atómica y no deja el
// inventario en negativo.
const aprobarAjuste = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data, error } = await supabase.rpc("aplicar_ajuste_inventario", {
    p_ajuste_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Ajuste no encontrado" });
    case "already_done":
      return res.status(400).json({ error: "El ajuste ya fue resuelto" });
    case "insufficient":
      return res.status(400).json({
        error: `El ajuste dejaría el inventario en negativo (disponible: ${r.disponible})`,
      });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  // Notifica al solicitante que su ajuste fue aprobado.
  const { data: aj } = await supabase
    .from("ajustes_inventario")
    .select("solicitado_por, tipo")
    .eq("id", id)
    .single();
  if (aj?.solicitado_por) {
    await supabase.from("notificaciones").insert({
      usuario_id: aj.solicitado_por,
      tipo: "ajuste_aprobado",
      titulo: "Ajuste aprobado",
      mensaje: `Tu ajuste (${aj.tipo}) fue aprobado y aplicado al inventario`,
      datos: { ajuste_id: id },
    });
  }

  return res.json({
    mensaje: "Ajuste aprobado y aplicado",
    cantidad_disponible: r.cantidad_disponible,
  });
};

// El gerente rechaza: no toca inventario, deja el comentario y la traza.
const rechazarAjuste = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;
  const { comentario } = req.body || {};

  const { data: aj } = await supabase
    .from("ajustes_inventario")
    .select("id, estado, tipo, solicitado_por")
    .eq("id", id)
    .single();
  if (!aj) return res.status(404).json({ error: "Ajuste no encontrado" });
  if (aj.estado !== "pendiente")
    return res.status(400).json({ error: "El ajuste ya fue resuelto" });

  const { error } = await supabase
    .from("ajustes_inventario")
    .update({
      estado: "rechazado",
      aprobado_por: usuario_id,
      comentario_resolucion: (comentario || "").trim() || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "AJUSTE_RECHAZADO",
    tabla: "ajustes_inventario",
    registro_id: id,
    valores_despues: { estado: "rechazado", comentario: comentario || null },
  });

  if (aj.solicitado_por) {
    await supabase.from("notificaciones").insert({
      usuario_id: aj.solicitado_por,
      tipo: "ajuste_rechazado",
      titulo: "Ajuste rechazado",
      mensaje: `Tu ajuste (${aj.tipo}) fue rechazado`,
      datos: { ajuste_id: id },
    });
  }

  return res.json({ mensaje: "Ajuste rechazado" });
};

module.exports = {
  crearAjuste,
  listarAjustes,
  aprobarAjuste,
  rechazarAjuste,
  TIPOS,
};
