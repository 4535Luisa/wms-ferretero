const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

const buscarProducto = async (req, res) => {
  const { referencia } = req.query;
  if (!referencia)
    return res.status(400).json({ error: "Referencia requerida" });

  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, unidad_base",
    )
    .eq("codigo_interno", referencia.trim())
    .eq("activo", true)
    .single();

  if (error || !data)
    return res.status(404).json({ error: "Producto no encontrado" });

  return res.json(data);
};

const listarProductos = async (req, res) => {
  const { buscar } = req.query;
  const lim = Math.min(Number(req.query.limit) || 100, 500);
  const off = Math.max(Number(req.query.offset) || 0, 0);

  let query = supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, unidad_base",
    )
    .eq("activo", true)
    .order("codigo_interno")
    .range(off, off + lim - 1);

  if (buscar) {
    const t = String(buscar)
      .replace(/[,()%]/g, "")
      .trim();
    if (t)
      query = query.or(
        `codigo_interno.ilike.%${t}%,descripcion_corta.ilike.%${t}%`,
      );
  }

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data);
};

const historialProducto = async (req, res) => {
  const { id } = req.params;

  const { data: producto } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, unidad_base",
    )
    .eq("id", id)
    .single();

  if (!producto)
    return res.status(404).json({ error: "Producto no encontrado" });

  const { data: movimientos, error } = await supabase
    .from("bitacora")
    .select("*, usuarios(nombre)")
    .eq("registro_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return sendServerError(res, error, req);

  const { data: inventario } = await supabase
    .from("inventario")
    .select("*, ubicaciones(codigo), bodegas(nombre, codigo)")
    .eq("producto_id", id);

  return res.json({ producto, movimientos, inventario });
};

// Inventario general: todos los productos con stock, con bodega y ubicación.
// Accesible para todos los roles excepto operario.
const inventarioGeneral = async (req, res) => {
  // Query directa sin RPC — resuelve ubicaciones en consultas separadas
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

const buscarPorBarras = async (req, res) => {
  const { codigo_barras } = req.query;
  if (!codigo_barras)
    return res.status(400).json({ error: "codigo_barras requerido" });

  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, codigo_barras",
    )
    .eq("codigo_barras", codigo_barras.trim())
    .eq("activo", true)
    .single();

  if (error || !data)
    return res.status(404).json({ error: "Producto no encontrado" });

  return res.json(data);
};

module.exports = {
  buscarProducto,
  buscarPorBarras,
  listarProductos,
  historialProducto,
  inventarioGeneral,
};
