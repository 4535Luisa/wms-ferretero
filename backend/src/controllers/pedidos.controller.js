const supabase = require("../utils/supabase");

const cargarCSV = async (req, res) => {
  const { pedidos } = req.body;

  if (!pedidos || pedidos.length === 0) {
    return res.status(400).json({ error: "No hay pedidos para cargar" });
  }

  const resultados = { importados: 0, omitidos: 0, errores: [] };

  for (const pedido of pedidos) {
    const { data: existente } = await supabase
      .from("pedidos")
      .select("id")
      .eq("numero", pedido.numero)
      .single();

    if (existente) {
      resultados.omitidos++;
      continue;
    }

    const { data: nuevoPedido, error: errorPedido } = await supabase
      .from("pedidos")
      .insert({
        numero: pedido.numero,
        cliente: pedido.cliente || pedido.numero,
        bodega_id: pedido.bodega_id || null,
        estado: "pendiente",
        prioridad: "normal",
      })
      .select()
      .single();

    if (errorPedido) {
      resultados.errores.push({
        numero: pedido.numero,
        error: errorPedido.message,
      });
      continue;
    }

    const items = pedido.items.map((item) => ({
      pedido_id: nuevoPedido.id,
      producto_id: item.producto_id,
      cantidad_pedida: item.cantidad_pedida,
      descripcion: item.descripcion,
      estado: "pendiente",
    }));

    const { error: errorItems } = await supabase
      .from("pedido_items")
      .insert(items);

    if (errorItems) {
      resultados.errores.push({
        numero: pedido.numero,
        error: errorItems.message,
      });
      continue;
    }

    resultados.importados++;
  }

  return res.json(resultados);
};

const listarPedidos = async (req, res) => {
  const { estado, bodega_id } = req.query;

  let query = supabase
    .from("pedidos")
    .select(
      `
      *,
      pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))
    `,
    )
    .order("created_at", { ascending: false });

  if (estado) query = query.eq("estado", estado);
  if (bodega_id) query = query.eq("bodega_id", bodega_id);

  const { data: pedidos, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const usuariosIds = [
    ...new Set([
      ...pedidos.filter((p) => p.operario_id).map((p) => p.operario_id),
      ...pedidos
        .filter((p) => p.montacarguista_id)
        .map((p) => p.montacarguista_id),
    ]),
  ];

  let usuariosMap = {};
  if (usuariosIds.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre, email, rol")
      .in("id", usuariosIds);

    if (usuarios) {
      usuariosMap = Object.fromEntries(usuarios.map((u) => [u.id, u]));
    }
  }

  const pedidosConUsuarios = pedidos.map((p) => ({
    ...p,
    operario: p.operario_id ? usuariosMap[p.operario_id] : null,
    montacarguista: p.montacarguista_id
      ? usuariosMap[p.montacarguista_id]
      : null,
  }));

  return res.json(pedidosConUsuarios);
};

const asignarPedido = async (req, res) => {
  const { id } = req.params;
  const { operario_id, montacarguista_id } = req.body;

  if (!operario_id && !montacarguista_id) {
    return res
      .status(400)
      .json({ error: "Debe asignar al menos un operario o montacarguista" });
  }

  const { data, error } = await supabase
    .from("pedidos")
    .update({
      operario_id: operario_id || null,
      montacarguista_id: montacarguista_id || null,
      estado: "asignado",
      hora_asignacion: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ data, mensaje: "Pedido asignado correctamente" });
};

const obtenerPedido = async (req, res) => {
  const { id } = req.params;

  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select(
      `
      *,
      pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))
    `,
    )
    .eq("id", id)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const usuariosIds = [pedido.operario_id, pedido.montacarguista_id].filter(
    Boolean,
  );
  let usuariosMap = {};

  if (usuariosIds.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre, email, rol")
      .in("id", usuariosIds);

    if (usuarios) {
      usuariosMap = Object.fromEntries(usuarios.map((u) => [u.id, u]));
    }
  }

  return res.json({
    ...pedido,
    operario: pedido.operario_id ? usuariosMap[pedido.operario_id] : null,
    montacarguista: pedido.montacarguista_id
      ? usuariosMap[pedido.montacarguista_id]
      : null,
  });
};

const listarOperarios = async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, bodega_id")
    .in("rol", ["operario", "montacarguista"])
    .eq("activo", true)
    .order("nombre");

  if (error) return res.status(500).json({ error: error.message });

  return res.json(data);
};

module.exports = {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  obtenerPedido,
  listarOperarios,
};
