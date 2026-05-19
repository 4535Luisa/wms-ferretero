const supabase = require("../utils/supabase");

const registrarMovimiento = async ({
  usuario_id,
  accion,
  tabla,
  registro_id,
  valores_antes,
  valores_despues,
}) => {
  await supabase.from("bitacora").insert({
    usuario_id,
    accion,
    tabla,
    registro_id,
    valores_antes,
    valores_despues,
  });
};

const crearRecepcion = async (req, res) => {
  const { bodega_id, proveedor, numero_oc } = req.body;

  if (!bodega_id || !proveedor) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  const { data: recepcion, error } = await supabase
    .from("recepciones")
    .insert({ bodega_id, proveedor, numero_oc, estado: "en_proceso" })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ recepcion, mensaje: "Recepción creada correctamente" });
};

const obtenerRecepciones = async (req, res) => {
  const { bodega_id } = req.query;

  let query = supabase
    .from("recepciones")
    .select(
      "*, recepcion_items(*, productos(codigo_interno, descripcion_corta, codigo_barras))",
    )
    .order("created_at", { ascending: false });

  if (bodega_id) query = query.eq("bodega_id", bodega_id);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  return res.json(data);
};

const obtenerRecepcion = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("recepciones")
    .select(
      "*, recepcion_items(*, productos(codigo_interno, descripcion_corta, codigo_barras, unidad_base))",
    )
    .eq("id", id)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json(data);
};

const registrarCantidad = async (req, res) => {
  const { item_id } = req.params;
  const { cantidad_recibida } = req.body;

  if (cantidad_recibida === undefined || cantidad_recibida < 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const { data, error } = await supabase
    .from("recepcion_items")
    .update({ cantidad_recibida, estado: "recibido" })
    .eq("id", item_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ data, mensaje: "Cantidad registrada" });
};

const inspeccionarItem = async (req, res) => {
  const { item_id } = req.params;
  const {
    estado_inspeccion,
    cantidad_aprobada,
    cantidad_rechazada,
    motivo_rechazo,
  } = req.body;

  const estadosValidos = ["aprobado", "rechazado", "parcial", "cuarentena"];
  if (!estadosValidos.includes(estado_inspeccion)) {
    return res.status(400).json({ error: "Estado de inspección inválido" });
  }

  const { data, error } = await supabase
    .from("recepcion_items")
    .update({
      estado: estado_inspeccion,
      cantidad_aprobada,
      cantidad_rechazada,
      motivo_rechazo,
    })
    .eq("id", item_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ data, mensaje: "Inspección registrada" });
};

const confirmarRecepcion = async (req, res) => {
  const { id } = req.params;

  const { data: items, error: errorItems } = await supabase
    .from("recepcion_items")
    .select("*, productos(id)")
    .eq("recepcion_id", id);

  if (errorItems) return res.status(500).json({ error: errorItems.message });

  const itemsSinProcesar = items.filter(
    (i) => i.estado === "pendiente" || i.estado === "recibido",
  );
  if (itemsSinProcesar.length > 0) {
    return res.status(400).json({ error: "Hay ítems sin inspeccionar" });
  }

  const itemsAprobados = items.filter(
    (i) => i.estado === "aprobado" || i.estado === "parcial",
  );

  for (const item of itemsAprobados) {
    const cantidad = item.cantidad_aprobada || item.cantidad_recibida;

    const { data: inventarioExistente } = await supabase
      .from("inventario")
      .select("*")
      .eq("producto_id", item.producto_id)
      .eq("bodega_id", item.bodega_id)
      .single();

    if (inventarioExistente) {
      await supabase
        .from("inventario")
        .update({
          cantidad_disponible:
            inventarioExistente.cantidad_disponible + cantidad,
        })
        .eq("id", inventarioExistente.id);
    } else {
      await supabase.from("inventario").insert({
        producto_id: item.producto_id,
        bodega_id: item.bodega_id,
        cantidad_disponible: cantidad,
      });
    }
  }

  await supabase
    .from("recepciones")
    .update({ estado: "confirmada" })
    .eq("id", id);

  return res.json({ mensaje: "Recepción confirmada e inventario actualizado" });
};

const agregarItemRecepcion = async (req, res) => {
  const { id } = req.params;
  const { producto_id, cantidad_recibida } = req.body;

  const { data: recepcion } = await supabase
    .from("recepciones")
    .select("bodega_id")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("recepcion_items")
    .insert({
      recepcion_id: id,
      producto_id,
      cantidad_esperada: cantidad_recibida,
      cantidad_recibida,
      cantidad_aprobada: cantidad_recibida,
      estado: "aprobado",
      bodega_id: recepcion?.bodega_id,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.json(data);
};

const confirmarRecepcionDirecto = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data: recepcion } = await supabase
    .from("recepciones")
    .select("bodega_id, proveedor, numero_oc")
    .eq("id", id)
    .single();

  const { data: items } = await supabase
    .from("recepcion_items")
    .select("*, productos(descripcion_corta, codigo_interno)")
    .eq("recepcion_id", id);

  if (!items || items.length === 0) {
    return res
      .status(400)
      .json({ error: "No hay productos en esta recepción" });
  }

  for (const item of items) {
    const { data: inv } = await supabase
      .from("inventario")
      .select("*")
      .eq("producto_id", item.producto_id)
      .eq("bodega_id", recepcion.bodega_id)
      .single();

    const cantidadAntes = inv?.cantidad_disponible || 0;
    const cantidadDespues = cantidadAntes + item.cantidad_recibida;

    if (inv) {
      await supabase
        .from("inventario")
        .update({ cantidad_disponible: cantidadDespues })
        .eq("id", inv.id);
    } else {
      await supabase.from("inventario").insert({
        producto_id: item.producto_id,
        bodega_id: recepcion.bodega_id,
        cantidad_disponible: item.cantidad_recibida,
      });
    }

    await supabase.from("bitacora").insert({
      usuario_id,
      accion: "RECEPCION_CONFIRMADA",
      tabla: "inventario",
      registro_id: item.producto_id,
      valores_antes: {
        cantidad_disponible: cantidadAntes,
        bodega_id: recepcion.bodega_id,
      },
      valores_despues: {
        cantidad_disponible: cantidadDespues,
        bodega_id: recepcion.bodega_id,
        proveedor: recepcion.proveedor,
        factura: recepcion.numero_oc,
        producto: item.productos?.descripcion_corta,
        referencia: item.productos?.codigo_interno,
        recepcion_id: id,
      },
    });
  }

  await supabase
    .from("recepciones")
    .update({ estado: "confirmada" })
    .eq("id", id);

  return res.json({ mensaje: "Recepción confirmada e inventario actualizado" });
};

module.exports = {
  crearRecepcion,
  obtenerRecepciones,
  obtenerRecepcion,
  registrarCantidad,
  inspeccionarItem,
  confirmarRecepcion,
  agregarItemRecepcion,
  confirmarRecepcionDirecto,
};
