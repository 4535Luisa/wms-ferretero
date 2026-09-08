const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

const buscarProducto = async (req, res) => {
  const { referencia } = req.query;
  if (!referencia)
    return res.status(400).json({ error: "referencia requerida" });

  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, codigo_barras, ean14, sin_codigo_barras, familia",
    )
    .or(
      `codigo_interno.ilike.${referencia.trim()},codigo_barras.eq.${referencia.trim()},ean14.eq.${referencia.trim()}`,
    )
    .eq("activo", true)
    .single();

  if (error || !data)
    return res.status(404).json({ error: "Producto no encontrado" });
  return res.json(data);
};

const buscarPorBarras = async (req, res) => {
  const { codigo_barras } = req.query;
  if (!codigo_barras)
    return res.status(400).json({ error: "codigo_barras requerido" });

  const cb = codigo_barras.trim();

  // Buscar por EAN14 (caja master) primero, luego por GTIN13 (unidad individual)
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, codigo_barras, ean14, sin_codigo_barras",
    )
    .or(`ean14.eq.${cb},codigo_barras.eq.${cb}`)
    .eq("activo", true)
    .limit(1);

  if (error || !data || data.length === 0)
    return res.status(404).json({ error: "Producto no encontrado" });
  return res.json(data[0]);
};

const listarProductos = async (req, res) => {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, codigo_barras, ean14, sin_codigo_barras, familia",
    )
    .eq("activo", true)
    .order("codigo_interno");
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

const historialProducto = async (req, res) => {
  const { id } = req.params;

  const [invRes, bitacoraRes] = await Promise.all([
    supabase
      .from("inventario")
      .select(
        "id, cantidad_disponible, cantidad_comprometida, ubicacion_id, bodega_id, ubicaciones(codigo), bodegas(codigo, nombre)",
      )
      .eq("producto_id", id),
    supabase
      .from("bitacora")
      .select(
        "id, accion, valores_antes, valores_despues, created_at, usuarios(nombre)",
      )
      .eq("tabla", "inventario")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return res.json({
    inventario: invRes.data || [],
    movimientos: bitacoraRes.data || [],
  });
};

const inventarioGeneral = async (req, res) => {
  const { data: rows, error } = await supabase
    .from("inventario")
    .select(
      "producto_id, cantidad_disponible, cantidad_comprometida, ubicacion_id, bodega_id",
    )
    .order("producto_id");

  if (error) return sendServerError(res, error, req);

  const productoIds = [...new Set((rows || []).map((r) => r.producto_id))];
  const bodegaIds = [...new Set((rows || []).map((r) => r.bodega_id))];
  const ubicacionIds = [
    ...new Set((rows || []).map((r) => r.ubicacion_id).filter(Boolean)),
  ];

  const [prodsRes, bodsRes, ubicsRes] = await Promise.all([
    supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", productoIds),
    supabase.from("bodegas").select("id, codigo, nombre").in("id", bodegaIds),
    ubicacionIds.length > 0
      ? supabase.from("ubicaciones").select("id, codigo").in("id", ubicacionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const prodMap = Object.fromEntries(
    (prodsRes.data || []).map((p) => [p.id, p]),
  );
  const bodMap = Object.fromEntries((bodsRes.data || []).map((b) => [b.id, b]));
  const ubicMap = Object.fromEntries(
    (ubicsRes.data || []).map((u) => [u.id, u]),
  );

  const resultado = (rows || []).map((r) => ({
    producto_id: r.producto_id,
    referencia: prodMap[r.producto_id]?.codigo_interno || "—",
    descripcion: prodMap[r.producto_id]?.descripcion_corta || "—",
    bodega: bodMap[r.bodega_id]?.codigo || "—",
    bodega_nombre: bodMap[r.bodega_id]?.nombre || "—",
    ubicacion: r.ubicacion_id ? ubicMap[r.ubicacion_id]?.codigo || null : null,
    cantidad_disponible: r.cantidad_disponible || 0,
    cantidad_comprometida: r.cantidad_comprometida || 0,
  }));

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.json(resultado);
};

// Actualizar código de barras de un producto
const actualizarCodigoBarras = async (req, res) => {
  const { id } = req.params;
  const { ean14, codigo_barras, sin_codigo_barras } = req.body || {};

  const update = {};
  if (ean14 !== undefined) update.ean14 = ean14 || null;
  if (codigo_barras !== undefined) update.codigo_barras = codigo_barras || null;
  if (sin_codigo_barras !== undefined)
    update.sin_codigo_barras = sin_codigo_barras;

  if (Object.keys(update).length === 0)
    return res.status(400).json({ error: "Nada que actualizar" });

  const { data, error } = await supabase
    .from("productos")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return sendServerError(res, error, req);
  return res.json({ data, mensaje: "Código de barras actualizado" });
};

module.exports = {
  buscarProducto,
  buscarPorBarras,
  listarProductos,
  historialProducto,
  inventarioGeneral,
  actualizarCodigoBarras,
};
