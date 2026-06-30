const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

// Adjunta nombres de quien contó (evita N+1).
const adjuntarUsuarios = async (conteos) => {
  const ids = [...new Set(conteos.map((c) => c.contado_por).filter(Boolean))];
  let mapa = {};
  if (ids.length > 0) {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", ids);
    if (data) mapa = Object.fromEntries(data.map((u) => [u.id, u.nombre]));
  }
  return conteos.map((c) => ({
    ...c,
    contador: c.contado_por ? mapa[c.contado_por] || null : null,
  }));
};

// Registra un conteo cíclico: lee el stock de sistema, calcula la diferencia y
// guarda el mini-conteo (sin tocar inventario; la corrección va por un ajuste).
const registrarConteo = async (req, res) => {
  const usuario_id = req.usuario?.id || null;
  const { producto_id, bodega_id, ubicacion_id, cantidad_contada, mini_conteo_id } =
    req.body || {};

  if (!isUuid(producto_id))
    return res.status(400).json({ error: "Producto inválido" });
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });
  if (ubicacion_id && !isUuid(ubicacion_id))
    return res.status(400).json({ error: "Ubicación inválida" });
  const contada = toFiniteNumber(cantidad_contada);
  if (contada === null || contada < 0)
    return res.status(400).json({ error: "Cantidad contada inválida" });

  // Stock de sistema: fila canónica por (producto, bodega) — la más antigua,
  // que es la misma que el ajuste generado va a corregir (consistencia conteo
  // ↔ ajuste). Coincide con cómo recepción y los demás movimientos casan el
  // inventario.
  const { data: invRow } = await supabase
    .from("inventario")
    .select("cantidad_disponible")
    .eq("producto_id", producto_id)
    .eq("bodega_id", bodega_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const sistema = invRow?.cantidad_disponible || 0;
  const diferencia = contada - sistema;
  const estado = diferencia === 0 ? "sin_diferencia" : "contado";

  // Si el conteo resuelve un mini-conteo pendiente (p. ej. de picking), lo
  // actualiza; si no, crea uno nuevo de tipo cíclico.
  let registro;
  if (mini_conteo_id && isUuid(mini_conteo_id)) {
    const { data, error } = await supabase
      .from("mini_conteos")
      .update({
        bodega_id,
        ubicacion_id: ubicacion_id || null,
        cantidad_sistema: sistema,
        cantidad_contada: contada,
        diferencia,
        estado,
        contado_por: usuario_id,
        counted_at: new Date().toISOString(),
      })
      .eq("id", mini_conteo_id)
      .select()
      .single();
    if (error) return sendServerError(res, error, req);
    registro = data;
  } else {
    const { data, error } = await supabase
      .from("mini_conteos")
      .insert({
        producto_id,
        bodega_id,
        ubicacion_id: ubicacion_id || null,
        cantidad_sistema: sistema,
        cantidad_contada: contada,
        diferencia,
        estado,
        origen: "ciclico",
        contado_por: usuario_id,
        counted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return sendServerError(res, error, req);
    registro = data;
  }

  return res.json({
    data: registro,
    diferencia,
    mensaje:
      diferencia === 0
        ? "Conteo sin diferencias"
        : `Diferencia de ${diferencia > 0 ? "+" : ""}${diferencia} — puedes generar un ajuste`,
  });
};

// Lista los conteos (opcionalmente por estado) con producto y bodega.
const listarConteos = async (req, res) => {
  const { estado } = req.query;
  let query = supabase
    .from("mini_conteos")
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

// Convierte la diferencia de un conteo en un AJUSTE pendiente de aprobación.
const generarAjuste = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data: mc } = await supabase
    .from("mini_conteos")
    .select("*")
    .eq("id", id)
    .single();
  if (!mc) return res.status(404).json({ error: "Conteo no encontrado" });
  if (mc.estado !== "contado")
    return res.status(400).json({
      error: "Solo se puede generar ajuste de un conteo con diferencia",
    });
  if (mc.ajuste_id)
    return res.status(400).json({ error: "Este conteo ya generó un ajuste" });
  if (!mc.diferencia || mc.diferencia === 0)
    return res.status(400).json({ error: "El conteo no tiene diferencia" });

  const sentido = mc.diferencia > 0 ? "incremento" : "decremento";
  const cantidad = Math.abs(mc.diferencia);

  const { data: ajuste, error } = await supabase
    .from("ajustes_inventario")
    .insert({
      producto_id: mc.producto_id,
      bodega_id: mc.bodega_id,
      ubicacion_id: mc.ubicacion_id || null,
      tipo: "correccion",
      sentido,
      cantidad,
      motivo: `Ajuste por conteo cíclico (sistema ${mc.cantidad_sistema} → contado ${mc.cantidad_contada})`,
      estado: "pendiente",
      solicitado_por: usuario_id,
    })
    .select()
    .single();
  if (error) return sendServerError(res, error, req);

  await supabase
    .from("mini_conteos")
    .update({ estado: "ajustado", ajuste_id: ajuste.id })
    .eq("id", id);

  // Notifica a los gerentes (igual que un ajuste normal).
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
        titulo: "Ajuste por conteo por aprobar",
        mensaje: "Un conteo cíclico generó un ajuste pendiente de aprobación",
        datos: { ajuste_id: ajuste.id, mini_conteo_id: id },
      })),
    );
  }

  return res.json({
    mensaje: "Ajuste generado, pendiente de aprobación del gerente",
    ajuste_id: ajuste.id,
  });
};

// Familias disponibles para programar conteos (distintas, no nulas).
const listarFamilias = async (req, res) => {
  const { data, error } = await supabase
    .from("productos")
    .select("familia")
    .eq("activo", true)
    .not("familia", "is", null)
    .order("familia");
  if (error) return sendServerError(res, error, req);
  const familias = [
    ...new Set((data || []).map((p) => (p.familia || "").trim()).filter(Boolean)),
  ];
  return res.json(familias);
};

// Programa un conteo cíclico por familia: encola un mini-conteo pendiente para
// cada producto de la familia que tenga inventario en la bodega indicada. No
// duplica los que ya tengan un conteo pendiente en esa bodega.
const programarConteoFamilia = async (req, res) => {
  const usuario_id = req.usuario?.id || null;
  const { familia, bodega_id } = req.body || {};

  if (!familia || !String(familia).trim())
    return res.status(400).json({ error: "Familia requerida" });
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });

  const { data: prods, error: errProds } = await supabase
    .from("productos")
    .select("id")
    .eq("familia", String(familia).trim())
    .eq("activo", true);
  if (errProds) return sendServerError(res, errProds, req);
  const prodIds = (prods || []).map((p) => p.id);
  if (prodIds.length === 0)
    return res.json({ creados: 0, mensaje: "La familia no tiene productos activos" });

  // Solo productos con inventario en esa bodega (algo que contar).
  const { data: inv } = await supabase
    .from("inventario")
    .select("producto_id")
    .eq("bodega_id", bodega_id)
    .in("producto_id", prodIds);
  const conInv = [...new Set((inv || []).map((r) => r.producto_id))];
  if (conInv.length === 0)
    return res.json({
      creados: 0,
      mensaje: "Ningún producto de la familia tiene inventario en esa bodega",
    });

  // Dedup: no recrear los que ya tienen un conteo pendiente en la bodega.
  const { data: pend } = await supabase
    .from("mini_conteos")
    .select("producto_id")
    .eq("bodega_id", bodega_id)
    .eq("estado", "pendiente")
    .in("producto_id", conInv);
  const yaPend = new Set((pend || []).map((r) => r.producto_id));
  const aCrear = conInv.filter((id) => !yaPend.has(id));

  if (aCrear.length > 0) {
    const filas = aCrear.map((producto_id) => ({
      producto_id,
      bodega_id,
      estado: "pendiente",
      origen: "ciclico",
    }));
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await supabase
        .from("mini_conteos")
        .insert(filas.slice(i, i + 500));
      if (error) return sendServerError(res, error, req);
    }
    await supabase.from("bitacora").insert({
      usuario_id,
      accion: "PROGRAMAR_CONTEO_FAMILIA",
      tabla: "mini_conteos",
      registro_id: bodega_id,
      valores_despues: {
        familia: String(familia).trim(),
        bodega_id,
        creados: aCrear.length,
      },
    });
  }

  return res.json({
    creados: aCrear.length,
    omitidos: conInv.length - aCrear.length,
    mensaje: `${aCrear.length} conteo(s) programado(s)${
      conInv.length - aCrear.length > 0
        ? ` · ${conInv.length - aCrear.length} ya estaban pendientes`
        : ""
    }`,
  });
};

module.exports = {
  registrarConteo,
  listarConteos,
  generarAjuste,
  listarFamilias,
  programarConteoFamilia,
};
