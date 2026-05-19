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
      `*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))`,
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
    if (usuarios)
      usuariosMap = Object.fromEntries(usuarios.map((u) => [u.id, u]));
  }

  return res.json(
    pedidos.map((p) => ({
      ...p,
      operario: p.operario_id ? usuariosMap[p.operario_id] : null,
      montacarguista: p.montacarguista_id
        ? usuariosMap[p.montacarguista_id]
        : null,
    })),
  );
};

const asignarTanda = async (req, res) => {
  const { asignaciones, montacarguistas } = req.body;
  const usuario_id = req.usuario?.id || null;

  if (!asignaciones || asignaciones.length === 0) {
    return res.status(400).json({ error: "No hay asignaciones para procesar" });
  }

  const resultados = [];

  for (const asignacion of asignaciones) {
    const { pedido_id, operario_id, prioridad } = asignacion;

    const { data: pedido } = await supabase
      .from("pedidos")
      .select(
        `*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque, unidad_base))`,
      )
      .eq("id", pedido_id)
      .single();

    if (!pedido) continue;

    await supabase
      .from("pedidos")
      .update({
        operario_id,
        estado: "asignado",
        prioridad: prioridad || "normal",
        hora_asignacion: new Date().toISOString(),
      })
      .eq("id", pedido_id);

    const itemsSaldos = [];
    const itemsCajas = {};

    for (const item of pedido.pedido_items || []) {
      const unidadEmpaque = item.productos?.unidad_empaque;
      if (!unidadEmpaque || unidadEmpaque <= 1) continue;

      const esCajaCompleta = item.cantidad_pedida % unidadEmpaque === 0;
      if (!esCajaCompleta) {
        itemsSaldos.push({ ...item, operario_id });
      } else {
        const { data: invs } = await supabase
          .from("inventario")
          .select("*, ubicaciones(codigo, bodega_id)")
          .eq("producto_id", item.producto_id)
          .gt("cantidad_disponible", 0)
          .order("created_at", { ascending: true });

        for (const inv of invs || []) {
          const bodegaId = inv.ubicaciones?.bodega_id;
          if (!bodegaId) continue;
          if (!itemsCajas[bodegaId]) itemsCajas[bodegaId] = [];
          itemsCajas[bodegaId].push({
            pedido_id,
            producto_id: item.producto_id,
            referencia: item.productos?.codigo_interno,
            descripcion: item.productos?.descripcion_corta,
            cantidad: item.cantidad_pedida,
            ubicacion: inv.ubicaciones?.codigo,
            ubicacion_id: inv.ubicacion_id,
            inventario_id: inv.id,
          });
          break;
        }
      }
    }

    for (const saldoItem of itemsSaldos) {
      const { data: invSaldos } = await supabase
        .from("inventario")
        .select("*")
        .eq("producto_id", saldoItem.producto_id)
        .eq(
          "bodega_id",
          (
            await supabase
              .from("bodegas")
              .select("id")
              .eq("codigo", "SALDOS")
              .single()
          ).data?.id,
        )
        .single();

      const cantidadSaldos =
        saldoItem.cantidad_pedida % (saldoItem.productos?.unidad_empaque || 1);
      const stockSaldos = invSaldos?.cantidad_disponible || 0;

      if (stockSaldos < cantidadSaldos) {
        const unidadEmpaque = saldoItem.productos?.unidad_empaque || 1;
        const { data: invBodega } = await supabase
          .from("inventario")
          .select("*, ubicaciones(codigo, bodega_id)")
          .eq("producto_id", saldoItem.producto_id)
          .gt("cantidad_disponible", unidadEmpaque - 1)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (invBodega) {
          const bodegaId = invBodega.ubicaciones?.bodega_id;
          if (bodegaId) {
            if (!itemsCajas[bodegaId]) itemsCajas[bodegaId] = [];
            itemsCajas[bodegaId].push({
              pedido_id,
              producto_id: saldoItem.producto_id,
              referencia: saldoItem.productos?.codigo_interno,
              descripcion: saldoItem.productos?.descripcion_corta,
              cantidad: unidadEmpaque,
              ubicacion: invBodega.ubicaciones?.codigo,
              ubicacion_id: invBodega.ubicacion_id,
              inventario_id: invBodega.id,
              destino_saldos: true,
            });
          }
        }
      }
    }

    for (const [bodegaId, items] of Object.entries(itemsCajas)) {
      const montacarguistaId = montacarguistas?.[bodegaId] || null;
      if (montacarguistaId) {
        await supabase
          .from("pedidos")
          .update({
            montacarguista_id: montacarguistaId,
          })
          .eq("id", pedido_id);
      }
    }

    await supabase.from("notificaciones").insert({
      usuario_id: operario_id,
      tipo: "pedido_asignado",
      titulo: "Pedido asignado",
      mensaje: `Se te asignó el pedido ${pedido.numero}`,
      datos: { pedido_id, pedido_numero: pedido.numero },
    });

    resultados.push({ pedido_id, pedido_numero: pedido.numero, ok: true });
  }

  return res.json({
    resultados,
    mensaje: `${resultados.length} pedidos asignados correctamente`,
  });
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
      `*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))`,
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
    if (usuarios)
      usuariosMap = Object.fromEntries(usuarios.map((u) => [u.id, u]));
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

const facturarPedido = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .select("*, pedido_items(*, productos(codigo_interno, descripcion_corta))")
    .eq("id", id)
    .single();

  if (errorPedido || !pedido)
    return res.status(404).json({ error: "Pedido no encontrado" });
  if (pedido.facturado)
    return res.status(400).json({ error: "El pedido ya fue facturado" });

  for (const item of pedido.pedido_items || []) {
    const cantidad = item.cantidad_picking || item.cantidad_pedida;

    const { data: invs } = await supabase
      .from("inventario")
      .select("*")
      .eq("producto_id", item.producto_id)
      .gt("cantidad_disponible", 0)
      .order("created_at", { ascending: true });

    let restante = cantidad;
    for (const inv of invs || []) {
      if (restante <= 0) break;
      const descontar = Math.min(restante, inv.cantidad_disponible);
      await supabase
        .from("inventario")
        .update({ cantidad_disponible: inv.cantidad_disponible - descontar })
        .eq("id", inv.id);

      await supabase.from("bitacora").insert({
        usuario_id,
        accion: "DESPACHO",
        tabla: "inventario",
        registro_id: item.producto_id,
        valores_antes: { cantidad_disponible: inv.cantidad_disponible },
        valores_despues: {
          cantidad_disponible: inv.cantidad_disponible - descontar,
          pedido_numero: pedido.numero,
          pedido_id: id,
        },
      });
      restante -= descontar;
    }
  }

  const { error } = await supabase
    .from("pedidos")
    .update({
      facturado: true,
      hora_facturacion: new Date().toISOString(),
      facturador_id: usuario_id,
      estado: "despachado",
    })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({
    mensaje: "Pedido facturado e inventario actualizado correctamente",
  });
};

const cambiarPrioridad = async (req, res) => {
  const { id } = req.params;
  const { prioridad } = req.body;

  if (!["normal", "urgente"].includes(prioridad)) {
    return res.status(400).json({ error: "Prioridad inválida" });
  }

  const { data, error } = await supabase
    .from("pedidos")
    .update({ prioridad })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ data, mensaje: "Prioridad actualizada" });
};

module.exports = {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  asignarTanda,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
  cambiarPrioridad,
};
