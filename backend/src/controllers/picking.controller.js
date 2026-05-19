const supabase = require("../utils/supabase");

const ORDEN_BODEGAS = ["B8", "B36", "B7"];

const getBodegaId = async (codigo) => {
  const { data } = await supabase
    .from("bodegas")
    .select("id")
    .eq("codigo", codigo)
    .single();
  return data?.id || null;
};

const getSaldosBodegaId = async () => {
  const { data } = await supabase
    .from("bodegas")
    .select("id")
    .eq("codigo", "SALDOS")
    .single();
  return data?.id || null;
};

const generarListasPicking = async (req, res) => {
  const { pedido_ids } = req.body;

  if (!pedido_ids || pedido_ids.length === 0) {
    return res.status(400).json({ error: "No hay pedidos para procesar" });
  }

  const bodegaIds = {};
  for (const codigo of ORDEN_BODEGAS) {
    bodegaIds[codigo] = await getBodegaId(codigo);
  }
  const saldosBodegaId = await getSaldosBodegaId();

  const listasPorBodega = {};
  for (const codigo of ORDEN_BODEGAS) {
    if (bodegaIds[codigo]) {
      listasPorBodega[bodegaIds[codigo]] = {
        bodega_id: bodegaIds[codigo],
        codigo,
        items: [],
      };
    }
  }

  for (const pedidoId of pedido_ids) {
    const { data: pedido } = await supabase
      .from("pedidos")
      .select(
        "*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))",
      )
      .eq("id", pedidoId)
      .single();

    if (!pedido) continue;

    for (const item of pedido.pedido_items || []) {
      const unidadEmpaque = item.productos?.unidad_empaque || 0;
      if (!unidadEmpaque || unidadEmpaque <= 1) continue;

      const cantidadPedida = item.cantidad_pedida;
      const cajasCompletas = Math.floor(cantidadPedida / unidadEmpaque);
      const unidadesSueltas = cantidadPedida % unidadEmpaque;

      if (cajasCompletas > 0) {
        let cajasRestantes = cajasCompletas;

        for (const codigo of ORDEN_BODEGAS) {
          if (cajasRestantes <= 0) break;
          const bodegaId = bodegaIds[codigo];
          if (!bodegaId) continue;

          const { data: invs } = await supabase
            .from("inventario")
            .select(
              "id, cantidad_disponible, ubicacion_id, ubicaciones(id, codigo)",
            )
            .eq("producto_id", item.producto_id)
            .eq("bodega_id", bodegaId)
            .gt("cantidad_disponible", 0)
            .order("cantidad_disponible", { ascending: true });

          for (const inv of invs || []) {
            if (cajasRestantes <= 0) break;
            const cajasDisponibles = Math.floor(
              inv.cantidad_disponible / unidadEmpaque,
            );
            if (cajasDisponibles <= 0) continue;

            const cajasATomar = Math.min(cajasRestantes, cajasDisponibles);

            listasPorBodega[bodegaId].items.push({
              pedido_id: pedidoId,
              pedido_numero: pedido.numero,
              producto_id: item.producto_id,
              ubicacion_id: inv.ubicacion_id,
              referencia: item.productos?.codigo_interno,
              descripcion: item.productos?.descripcion_corta,
              cantidad_cajas: cajasATomar,
              cantidad_unidades: cajasATomar * unidadEmpaque,
              ubicacion_codigo: inv.ubicaciones?.codigo,
              destino_saldos: false,
            });

            cajasRestantes -= cajasATomar;
          }
        }
      }

      if (unidadesSueltas > 0) {
        const { data: invSaldos } = await supabase
          .from("inventario")
          .select("cantidad_disponible")
          .eq("producto_id", item.producto_id)
          .eq("bodega_id", saldosBodegaId)
          .single();

        const stockSaldos = invSaldos?.cantidad_disponible || 0;

        if (stockSaldos < unidadesSueltas) {
          for (const codigo of ORDEN_BODEGAS) {
            const bodegaId = bodegaIds[codigo];
            if (!bodegaId) continue;

            const { data: invs } = await supabase
              .from("inventario")
              .select(
                "id, cantidad_disponible, ubicacion_id, ubicaciones(id, codigo)",
              )
              .eq("producto_id", item.producto_id)
              .eq("bodega_id", bodegaId)
              .gte("cantidad_disponible", unidadEmpaque)
              .order("cantidad_disponible", { ascending: true })
              .limit(1);

            if (invs && invs.length > 0) {
              const inv = invs[0];
              listasPorBodega[bodegaId].items.push({
                pedido_id: pedidoId,
                pedido_numero: pedido.numero,
                producto_id: item.producto_id,
                ubicacion_id: inv.ubicacion_id,
                referencia: item.productos?.codigo_interno,
                descripcion: item.productos?.descripcion_corta,
                cantidad_cajas: 1,
                cantidad_unidades: unidadEmpaque,
                ubicacion_codigo: inv.ubicaciones?.codigo,
                destino_saldos: true,
              });
              break;
            }
          }
        }
      }
    }
  }

  const listasCreadas = [];
  for (const [bodegaId, lista] of Object.entries(listasPorBodega)) {
    if (lista.items.length === 0) continue;

    const { data: listaCreada, error } = await supabase
      .from("listas_picking")
      .insert({ bodega_id: bodegaId, estado: "pendiente" })
      .select()
      .single();

    if (error || !listaCreada) continue;

    const itemsConListaId = lista.items.map((item) => ({
      lista_id: listaCreada.id,
      pedido_id: item.pedido_id,
      producto_id: item.producto_id,
      ubicacion_id: item.ubicacion_id,
      referencia: item.referencia,
      descripcion: item.descripcion,
      cantidad_cajas: item.cantidad_cajas,
      cantidad_unidades: item.cantidad_unidades,
      destino_saldos: item.destino_saldos,
      estado: "pendiente",
    }));

    await supabase.from("lista_picking_items").insert(itemsConListaId);

    listasCreadas.push({
      id: listaCreada.id,
      bodega_codigo: lista.codigo,
      bodega_id: bodegaId,
      total_items: lista.items.length,
      total_cajas: lista.items.reduce((a, i) => a + i.cantidad_cajas, 0),
    });
  }

  return res.json({
    listas: listasCreadas,
    mensaje: `${listasCreadas.length} listas de picking generadas`,
  });
};

const listarListasPicking = async (req, res) => {
  const { data, error } = await supabase
    .from("listas_picking")
    .select(
      `
      *,
      bodegas(nombre, codigo),
      usuarios(nombre),
      lista_picking_items(
        *,
        ubicaciones(codigo),
        pedidos(numero)
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
};

const asignarMontacarguista = async (req, res) => {
  const { id } = req.params;
  const { montacarguista_id } = req.body;

  const { data, error } = await supabase
    .from("listas_picking")
    .update({ montacarguista_id, estado: "asignada" })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("notificaciones").insert({
    usuario_id: montacarguista_id,
    tipo: "lista_asignada",
    titulo: "Lista de picking asignada",
    mensaje: "Tienes una nueva lista de cajas para bajar",
    datos: { lista_id: id },
  });

  return res.json({ data, mensaje: "Montacarguista asignado correctamente" });
};

const misListas = async (req, res) => {
  const usuario_id = req.usuario?.id;

  const { data, error } = await supabase
    .from("listas_picking")
    .select(
      `
      *,
      bodegas(nombre, codigo),
      lista_picking_items(
        *,
        ubicaciones(codigo),
        pedidos(numero)
      )
    `,
    )
    .eq("montacarguista_id", usuario_id)
    .in("estado", ["asignada", "en_proceso"])
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
};

const bajarCaja = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: item } = await supabase
    .from("lista_picking_items")
    .select("*, productos(codigo_interno), listas_picking(bodega_id)")
    .eq("id", id)
    .single();

  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

  await supabase
    .from("lista_picking_items")
    .update({ estado: "bajada" })
    .eq("id", id);

  if (item.ubicacion_id) {
    const { data: inv } = await supabase
      .from("inventario")
      .select("*")
      .eq("producto_id", item.producto_id)
      .eq("ubicacion_id", item.ubicacion_id)
      .single();

    if (inv) {
      const nuevaCantidad = Math.max(
        0,
        inv.cantidad_disponible - item.cantidad_unidades,
      );
      await supabase
        .from("inventario")
        .update({ cantidad_disponible: nuevaCantidad })
        .eq("id", inv.id);

      await supabase.from("bitacora").insert({
        usuario_id,
        accion: "PICKING",
        tabla: "inventario",
        registro_id: item.producto_id,
        valores_antes: {
          cantidad_disponible: inv.cantidad_disponible,
          ubicacion_id: item.ubicacion_id,
        },
        valores_despues: {
          cantidad_disponible: nuevaCantidad,
          ubicacion_id: item.ubicacion_id,
          pedido_id: item.pedido_id,
          lista_id: item.lista_id,
        },
      });
    }
  }

  if (item.pedido_id) {
    await supabase.from("notificaciones").insert({
      usuario_id: null,
      tipo: "caja_bajada",
      titulo: "Caja bajada",
      mensaje: `La caja de ${item.descripcion} ya fue bajada`,
      datos: {
        pedido_id: item.pedido_id,
        producto_id: item.producto_id,
        referencia: item.productos?.codigo_interno,
        destino_saldos: item.destino_saldos,
      },
    });
  }

  return res.json({
    mensaje: "Caja registrada como bajada e inventario actualizado",
  });
};

module.exports = {
  generarListasPicking,
  listarListasPicking,
  asignarMontacarguista,
  misListas,
  bajarCaja,
};
