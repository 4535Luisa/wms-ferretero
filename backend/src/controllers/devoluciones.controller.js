const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

const TIPOS = ["cliente", "proveedor"];

const adjuntarUsuarios = async (devs) => {
  const ids = [...new Set(devs.map((d) => d.registrado_por).filter(Boolean))];
  let mapa = {};
  if (ids.length > 0) {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", ids);
    if (data) mapa = Object.fromEntries(data.map((u) => [u.id, u.nombre]));
  }
  return devs.map((d) => ({
    ...d,
    registrador: d.registrado_por ? mapa[d.registrado_por] || null : null,
  }));
};

// Registra una devolución (cliente reingresa stock, proveedor lo descuenta) de
// forma atómica vía RPC, sin dejar el inventario negativo.
const crearDevolucion = async (req, res) => {
  const usuario_id = req.usuario?.id || null;
  const {
    tipo,
    producto_id,
    bodega_id,
    ubicacion_id,
    cantidad,
    motivo,
    referencia_externa,
  } = req.body || {};

  if (!TIPOS.includes(tipo))
    return res.status(400).json({ error: "Tipo de devolución inválido" });
  if (!isUuid(producto_id))
    return res.status(400).json({ error: "Producto inválido" });
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });
  if (ubicacion_id && !isUuid(ubicacion_id))
    return res.status(400).json({ error: "Ubicación inválida" });
  const cant = toFiniteNumber(cantidad);
  if (cant === null || cant <= 0)
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
  if (!motivo?.trim())
    return res.status(400).json({ error: "El motivo es obligatorio" });

  const { data, error } = await supabase.rpc("registrar_devolucion", {
    p_tipo: tipo,
    p_producto_id: producto_id,
    p_bodega_id: bodega_id,
    p_ubicacion_id: ubicacion_id || null,
    p_cantidad: cant,
    p_motivo: motivo.trim(),
    p_referencia: referencia_externa || null,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "invalid":
      return res.status(400).json({ error: "Datos de la devolución inválidos" });
    case "insufficient":
      return res.status(400).json({
        error: `Stock insuficiente para devolver al proveedor (disponible: ${r.disponible})`,
      });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({
    mensaje:
      tipo === "cliente"
        ? "Devolución de cliente registrada — stock reingresado"
        : "Devolución a proveedor registrada — stock descontado",
    devolucion_id: r.devolucion_id,
    cantidad_disponible: r.cantidad_disponible,
  });
};

// Lista las devoluciones (opcionalmente por tipo) con producto y bodega.
const listarDevoluciones = async (req, res) => {
  const { tipo } = req.query;
  let query = supabase
    .from("devoluciones")
    .select(
      "*, productos(codigo_interno, descripcion_corta), bodegas(codigo, nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (tipo && TIPOS.includes(tipo)) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(await adjuntarUsuarios(data || []));
};

module.exports = { crearDevolucion, listarDevoluciones };
