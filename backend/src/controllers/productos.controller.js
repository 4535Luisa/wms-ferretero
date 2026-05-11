const supabase = require("../utils/supabase");

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

  if (error || !data) return res.status(404).json(null);

  return res.json(data);
};

const listarProductos = async (req, res) => {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, unidad_base",
    )
    .eq("activo", true)
    .order("codigo_interno");

  if (error) return res.status(500).json({ error: error.message });

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
    .select("*")
    .eq("registro_id", id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const { data: inventario } = await supabase
    .from("inventario")
    .select("*, ubicaciones(codigo), bodegas(nombre, codigo)")
    .eq("producto_id", id);

  return res.json({ producto, movimientos, inventario });
};

module.exports = { buscarProducto, listarProductos, historialProducto };
