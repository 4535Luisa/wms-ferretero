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
  const { data, error } = await supabase
    .from("inventario")
    .select(
      `
      producto_id,
      cantidad_disponible,
      cantidad_comprometida,
      ubicaciones(codigo),
      bodegas(codigo, nombre),
      productos(codigo_interno, descripcion_corta)
    `,
    )
    .order("producto_id");

  if (error) return sendServerError(res, error, req);

  const resultado = (data || []).map((r) => ({
    producto_id: r.producto_id,
    referencia: r.productos?.codigo_interno || "—",
    descripcion: r.productos?.descripcion_corta || "—",
    bodega: r.bodegas?.codigo || "—",
    bodega_nombre: r.bodegas?.nombre || "—",
    ubicacion: r.ubicaciones?.codigo || null,
    cantidad_disponible: r.cantidad_disponible || 0,
    cantidad_comprometida: r.cantidad_comprometida || 0,
  }));

  return res.json(resultado);
};

module.exports = {
  buscarProducto,
  listarProductos,
  historialProducto,
  inventarioGeneral,
};
