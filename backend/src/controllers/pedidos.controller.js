const supabase = require("../utils/supabase");
const { ORDEN_BODEGAS, splitCajaSaldo } = require("../utils/picking");
const { sendServerError } = require("../utils/errors");
const { toFiniteNumber } = require("../utils/validate");
const { verificarYRegistrar, normalizarRef } = require("../utils/escaneo");

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

// Adjunta los objetos operario/montacarguista a una lista de pedidos en una
// sola consulta (evita N+1 y deduplica la lógica de mapeo entre endpoints).
const adjuntarUsuarios = async (pedidos) => {
  const ids = [
    ...new Set(
      pedidos.flatMap((p) =>
        [p.operario_id, p.montacarguista_id, p.facturador_id].filter(Boolean),
      ),
    ),
  ];
  let mapa = {};
  if (ids.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre, email, rol")
      .in("id", ids);
    if (usuarios) mapa = Object.fromEntries(usuarios.map((u) => [u.id, u]));
  }
  return pedidos.map((p) => ({
    ...p,
    operario: p.operario_id ? mapa[p.operario_id] || null : null,
    montacarguista: p.montacarguista_id ? mapa[p.montacarguista_id] || null : null,
    facturador: p.facturador_id ? mapa[p.facturador_id] || null : null,
  }));
};

const listarPedidos = async (req, res) => {
  const { estado, bodega_id, limit, offset } = req.query;

  let query = supabase
    .from("pedidos")
    .select(
      `*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))`,
    )
    .order("created_at", { ascending: false });

  if (estado) query = query.eq("estado", estado);
  if (bodega_id) query = query.eq("bodega_id", bodega_id);

  // Paginación opcional: solo se aplica si el cliente pasa ?limit.
  if (limit) {
    const lim = Math.min(Number(limit) || 50, 200);
    const off = Math.max(Number(offset) || 0, 0);
    query = query.range(off, off + lim - 1);
  }

  const { data: pedidos, error } = await query;
  if (error) return sendServerError(res, error, req);

  return res.json(await adjuntarUsuarios(pedidos));
};

// Acumula unidades sueltas en la cola de saldos, consolidando por operario +
// producto (railguard: "saldos consolida por operario — nunca duplicados").
const upsertSaldoConsolidado = async (operario_id, producto_id, cantidad) => {
  if (!operario_id || !producto_id || !cantidad || cantidad <= 0) return;

  const { data: existente } = await supabase
    .from("saldos")
    .select("id, cantidad_total")
    .eq("operario_id", operario_id)
    .eq("producto_id", producto_id)
    .in("estado", ["pendiente", "confirmado"])
    .limit(1)
    .maybeSingle();

  if (existente) {
    await supabase
      .from("saldos")
      .update({ cantidad_total: (existente.cantidad_total || 0) + cantidad })
      .eq("id", existente.id);
  } else {
    await supabase.from("saldos").insert({
      operario_id,
      producto_id,
      cantidad_total: cantidad,
      estado: "pendiente",
    });
  }
};

// Reposición de SALDOS consolidada POR OPERARIO (railguard §6.2): suma las
// unidades sueltas que necesita el operario por referencia, compara contra el
// stock de la bodega SALDOS y, si no alcanza, agrega 1 caja al recorrido del
// montacarguista con destino SALDOS (idempotente: no duplica cajas).
const generarReposicionSaldos = async (operario_id, repoRep) => {
  const { data: saldos } = await supabase
    .from("saldos")
    .select("producto_id, cantidad_total")
    .eq("operario_id", operario_id)
    .eq("estado", "pendiente");
  if (!saldos || saldos.length === 0) return;

  const { data: bodegasData } = await supabase
    .from("bodegas")
    .select("id, codigo")
    .in("codigo", [...ORDEN_BODEGAS, "SALDOS"]);
  const codigoToId = {};
  for (const b of bodegasData || []) codigoToId[b.codigo] = b.id;
  const saldosBodegaId = codigoToId["SALDOS"];

  for (const s of saldos) {
    const pedidoRepresentativo = repoRep[`${operario_id}::${s.producto_id}`];
    if (!pedidoRepresentativo) continue;

    // Stock disponible real en SALDOS.
    const { data: invSaldos } = await supabase
      .from("inventario")
      .select("cantidad_disponible, cantidad_comprometida")
      .eq("producto_id", s.producto_id)
      .eq("bodega_id", saldosBodegaId);
    const dispSaldos = (invSaldos || []).reduce(
      (a, r) =>
        a + ((r.cantidad_disponible || 0) - (r.cantidad_comprometida || 0)),
      0,
    );
    if (dispSaldos >= s.cantidad_total) continue; // alcanza, no reponer

    // Idempotencia: ¿ya hay una caja de reposición pendiente para este producto?
    const { data: yaExiste } = await supabase
      .from("lista_picking_items")
      .select("id")
      .eq("producto_id", s.producto_id)
      .eq("destino_saldos", true)
      .eq("estado", "pendiente")
      .limit(1);
    if (yaExiste && yaExiste.length > 0) continue;

    const { data: prod } = await supabase
      .from("productos")
      .select("unidad_empaque, codigo_interno, descripcion_corta")
      .eq("id", s.producto_id)
      .single();
    const ue = prod?.unidad_empaque || 0;
    if (ue <= 1) continue;

    // Busca una bodega con disponible real >= 1 caja, en orden B8 → B36 → B7.
    for (const codigo of ORDEN_BODEGAS) {
      const bodegaId = codigoToId[codigo];
      if (!bodegaId) continue;

      const { data: invs } = await supabase
        .from("inventario")
        .select("id, cantidad_disponible, cantidad_comprometida, ubicacion_id")
        .eq("producto_id", s.producto_id)
        .eq("bodega_id", bodegaId)
        .gt("cantidad_disponible", 0)
        .order("cantidad_disponible", { ascending: true });

      const inv = (invs || []).find(
        (r) => r.cantidad_disponible - (r.cantidad_comprometida || 0) >= ue,
      );
      if (!inv) continue;

      // Lista de esa bodega (pendiente/asignada/en_proceso) o crea una nueva.
      let { data: lista } = await supabase
        .from("listas_picking")
        .select("id")
        .eq("bodega_id", bodegaId)
        .in("estado", ["pendiente", "asignada", "en_proceso"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lista) {
        const { data: nueva } = await supabase
          .from("listas_picking")
          .insert({ bodega_id: bodegaId, estado: "pendiente" })
          .select("id")
          .single();
        lista = nueva;
      }
      if (!lista) break;

      let ubicCodigo = null;
      if (inv.ubicacion_id) {
        const { data: u } = await supabase
          .from("ubicaciones")
          .select("codigo")
          .eq("id", inv.ubicacion_id)
          .single();
        ubicCodigo = u?.codigo || null;
      }

      // Reserva ATÓMICA de la caja (comprometido) — solo si hay disponible real
      // (RPC con FOR UPDATE, anti doble-picking). Si otro proceso tomó el stock
      // entremedias, prueba la siguiente bodega en vez de sobre-comprometer.
      // Ver sql/2026-06-02_rpc_reservar_picking.sql
      const { data: rsv } = await supabase.rpc("reservar_inventario_picking", {
        p_inventario_id: inv.id,
        p_unidades: ue,
      });
      if (rsv?.status !== "ok") continue;

      await supabase.from("lista_picking_items").insert({
        lista_id: lista.id,
        pedido_id: pedidoRepresentativo,
        producto_id: s.producto_id,
        ubicacion_id: inv.ubicacion_id,
        ubicacion_codigo: ubicCodigo,
        referencia: prod?.codigo_interno,
        descripcion: prod?.descripcion_corta,
        cantidad_cajas: 1,
        cantidad_unidades: ue,
        destino_saldos: true,
        estado: "pendiente",
      });
      break;
    }
  }
};

const asignarTanda = async (req, res) => {
  const { asignaciones, montacarguistas } = req.body;
  const usuario_id = req.usuario?.id || null;

  if (!asignaciones || asignaciones.length === 0) {
    return res.status(400).json({ error: "No hay asignaciones para procesar" });
  }

  const primerMontacarguista = montacarguistas
    ? Object.values(montacarguistas).find(Boolean) || null
    : null;

  const resultados = [];
  const opsConSaldo = new Set();
  const repoRep = {}; // `${operario_id}::${producto_id}` -> pedido representativo

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
        montacarguista_id: primerMontacarguista,
        estado: "asignado",
        prioridad: prioridad || "normal",
        hora_asignacion: new Date().toISOString(),
      })
      .eq("id", pedido_id);

    // Calcula el split caja/saldo de cada ítem y lo persiste para que el
    // operario vea qué recoge del montacarguista y qué en bodega de saldos.
    for (const item of pedido.pedido_items || []) {
      const { aplica, unidadesSueltas } = splitCajaSaldo(
        item.cantidad_pedida,
        item.productos?.unidad_empaque,
      );
      if (!aplica) continue;

      // cantidad_saldos = unidades sueltas (informativo para el operario y la
      // cola de saldos). cantidad_picking lo confirma el operario al alistar.
      await supabase
        .from("pedido_items")
        .update({
          cantidad_saldos: unidadesSueltas,
          estado: "pendiente",
        })
        .eq("id", item.id);

      if (unidadesSueltas > 0) {
        await upsertSaldoConsolidado(
          operario_id,
          item.producto_id,
          unidadesSueltas,
        );
        opsConSaldo.add(operario_id);
        const k = `${operario_id}::${item.producto_id}`;
        if (!repoRep[k]) repoRep[k] = pedido_id;
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

  // Una vez consolidados los saldos por operario, decide la reposición de cajas
  // con destino SALDOS (una sola vez por operario, no por pedido).
  for (const opId of opsConSaldo) {
    await generarReposicionSaldos(opId, repoRep);
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

  if (error) return sendServerError(res, error, req);
  return res.json({ data, mensaje: "Pedido asignado correctamente" });
};

// Reasigna un pedido a otro operario CONSERVANDO el avance: no se tocan los
// estados de los ítems (los ya 'listo' siguen 'listo'), ni cantidad_picking ni
// las estibas vinculadas. Mueve los saldos pendientes del operario anterior al
// nuevo solo cuando es seguro (nunca toca inventario). Notifica a ambos.
const reasignarPedido = async (req, res) => {
  const { id } = req.params;
  const { operario_id } = req.body;
  const usuario_id = req.usuario?.id || null;

  if (!operario_id)
    return res.status(400).json({ error: "Debe indicar el operario destino" });

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*, pedido_items(id, producto_id, estado, cantidad_saldos)")
    .eq("id", id)
    .single();
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });

  if (["cerrado", "despachado"].includes(pedido.estado)) {
    return res.status(400).json({
      error: "No se puede reasignar un pedido cerrado o despachado",
    });
  }
  if (pedido.operario_id === operario_id) {
    return res
      .status(400)
      .json({ error: "El pedido ya está asignado a ese operario" });
  }

  const operarioAnterior = pedido.operario_id;

  const { error } = await supabase
    .from("pedidos")
    .update({ operario_id })
    .eq("id", id);
  if (error) return sendServerError(res, error, req);

  // Mueve los saldos PENDIENTES de los productos de este pedido del operario
  // anterior al nuevo, solo si el anterior no tiene OTRO pedido activo que
  // necesite ese producto en saldos (la cola de saldos se consolida por
  // operario, así que no se puede partir una fila compartida).
  const productosSaldo = [
    ...new Set(
      (pedido.pedido_items || [])
        .filter((i) => (i.cantidad_saldos || 0) > 0)
        .map((i) => i.producto_id),
    ),
  ];
  const saldosNoMovidos = [];
  if (operarioAnterior && productosSaldo.length > 0) {
    const { data: otrosPedidos } = await supabase
      .from("pedidos")
      .select("id, pedido_items(producto_id, cantidad_saldos)")
      .eq("operario_id", operarioAnterior)
      .neq("id", id)
      .in("estado", ["asignado", "en_proceso", "en_picking"]);
    const productosEnOtros = new Set();
    for (const p of otrosPedidos || [])
      for (const it of p.pedido_items || [])
        if ((it.cantidad_saldos || 0) > 0) productosEnOtros.add(it.producto_id);

    for (const productoId of productosSaldo) {
      if (productosEnOtros.has(productoId)) {
        saldosNoMovidos.push(productoId);
        continue;
      }
      const { data: saldoAnt } = await supabase
        .from("saldos")
        .select("id, cantidad_total")
        .eq("operario_id", operarioAnterior)
        .eq("producto_id", productoId)
        .eq("estado", "pendiente")
        .maybeSingle();
      if (!saldoAnt) {
        saldosNoMovidos.push(productoId);
        continue;
      }
      const { data: saldoNuevo } = await supabase
        .from("saldos")
        .select("id, cantidad_total")
        .eq("operario_id", operario_id)
        .eq("producto_id", productoId)
        .eq("estado", "pendiente")
        .maybeSingle();
      if (saldoNuevo) {
        await supabase
          .from("saldos")
          .update({
            cantidad_total:
              (saldoNuevo.cantidad_total || 0) + (saldoAnt.cantidad_total || 0),
          })
          .eq("id", saldoNuevo.id);
        await supabase.from("saldos").delete().eq("id", saldoAnt.id);
      } else {
        await supabase
          .from("saldos")
          .update({ operario_id })
          .eq("id", saldoAnt.id);
      }
    }
  }

  const itemsListos = (pedido.pedido_items || []).filter(
    (i) => i.estado === "listo",
  ).length;
  const totalItems = (pedido.pedido_items || []).length;

  if (operarioAnterior) {
    await supabase.from("notificaciones").insert({
      usuario_id: operarioAnterior,
      tipo: "pedido_reasignado",
      titulo: "Pedido reasignado",
      mensaje: `El pedido ${pedido.numero} se reasignó a otro operario`,
      datos: { pedido_id: id, pedido_numero: pedido.numero },
    });
  }
  await supabase.from("notificaciones").insert({
    usuario_id: operario_id,
    tipo: "pedido_asignado",
    titulo: "Pedido heredado",
    mensaje: `Recibiste el pedido ${pedido.numero} (${itemsListos}/${totalItems} referencias ya listas)`,
    datos: { pedido_id: id, pedido_numero: pedido.numero },
  });

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "REASIGNACION_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { operario_id: operarioAnterior },
    valores_despues: {
      operario_id,
      pedido_numero: pedido.numero,
      items_listos: itemsListos,
      total_items: totalItems,
      saldos_no_movidos: saldosNoMovidos,
    },
  });

  return res.json({
    mensaje: `Pedido reasignado conservando el avance (${itemsListos}/${totalItems} referencias listas)`,
    saldos_no_movidos: saldosNoMovidos.length,
  });
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

  if (error) return sendServerError(res, error, req);

  const [enriquecido] = await adjuntarUsuarios([pedido]);
  return res.json(enriquecido);
};

const listarOperarios = async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, bodega_id")
    .in("rol", ["operario", "montacarguista"])
    .eq("activo", true)
    .order("nombre");

  if (error) return sendServerError(res, error, req);
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
  if (pedido.estado !== "cerrado") {
    return res.status(400).json({
      error: "Solo se pueden facturar pedidos cerrados por el operario",
    });
  }

  // El inventario ya se descontó físicamente cuando el montacarguista bajó las
  // cajas (y cuando saldos entregó las unidades sueltas). La facturación NO
  // vuelve a descontar para no duplicar el movimiento; solo deja trazabilidad.
  const resumenItems = (pedido.pedido_items || []).map((item) => ({
    producto_id: item.producto_id,
    referencia: item.productos?.codigo_interno,
    cantidad_facturada: item.cantidad_picking ?? item.cantidad_pedida,
    cantidad_pedida: item.cantidad_pedida,
  }));

  const { error } = await supabase
    .from("pedidos")
    .update({
      facturado: true,
      hora_facturacion: new Date().toISOString(),
      facturador_id: usuario_id,
      estado: "despachado",
    })
    .eq("id", id);

  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "FACTURACION",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: "cerrado", facturado: false },
    valores_despues: {
      estado: "despachado",
      facturado: true,
      pedido_numero: pedido.numero,
      items: resumenItems,
    },
  });

  return res.json({
    mensaje: "Pedido facturado correctamente",
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

  if (error) return sendServerError(res, error, req);
  return res.json({ data, mensaje: "Prioridad actualizada" });
};

// ----- Flujo del operario (Fase 3) -----

// Pedidos asignados al operario autenticado, con su split caja/saldo y el
// estado del barrido del montacarguista por ítem.
const misPedidosOperario = async (req, res) => {
  const operario_id = req.usuario?.id;
  if (!operario_id) return res.status(401).json({ error: "No autenticado" });

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select(
      `*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))`,
    )
    .eq("operario_id", operario_id)
    .in("estado", ["asignado", "en_proceso", "cerrado"])
    .order("prioridad", { ascending: false })
    .order("hora_asignacion", { ascending: true });

  if (error) return sendServerError(res, error, req);
  if (!pedidos || pedidos.length === 0) return res.json([]);

  // Estado del barrido: trae los ítems de picking (cajas) de estos pedidos.
  const pedidoIds = pedidos.map((p) => p.id);
  const { data: cajas } = await supabase
    .from("lista_picking_items")
    .select(
      "pedido_id, producto_id, estado, destino_saldos, cantidad_cajas, ubicacion_codigo",
    )
    .in("pedido_id", pedidoIds);

  const cajasPorPedidoProducto = {};
  for (const c of cajas || []) {
    const k = `${c.pedido_id}::${c.producto_id}`;
    if (!cajasPorPedidoProducto[k]) cajasPorPedidoProducto[k] = [];
    cajasPorPedidoProducto[k].push(c);
  }

  // Estiba de cada ítem (para que el operario sepa dónde está cada caja).
  const estibaIds = [
    ...new Set(
      pedidos
        .flatMap((p) => p.pedido_items || [])
        .map((i) => i.estiba_id)
        .filter(Boolean),
    ),
  ];
  const estibasMap = {};
  if (estibaIds.length > 0) {
    const { data: estibas } = await supabase
      .from("estibas")
      .select("id, nombre")
      .in("id", estibaIds);
    for (const e of estibas || []) estibasMap[e.id] = e.nombre;
  }

  const enriquecidos = pedidos.map((p) => ({
    ...p,
    pedido_items: (p.pedido_items || []).map((item) => {
      const cajasItem =
        cajasPorPedidoProducto[`${p.id}::${item.producto_id}`] || [];
      const totalCajas = cajasItem.length;
      const cajasBajadas = cajasItem.filter(
        (c) => c.estado && c.estado !== "pendiente",
      ).length;
      return {
        ...item,
        cajas_total: totalCajas,
        cajas_bajadas: cajasBajadas,
        cajas_listas: totalCajas > 0 && cajasBajadas === totalCajas,
        estiba_nombre: item.estiba_id ? estibasMap[item.estiba_id] || null : null,
      };
    }),
  }));

  return res.json(enriquecidos);
};

// El operario marca una referencia como lista o ajusta la cantidad alistada.
// Si la cantidad difiere de la pedida, el motivo es obligatorio (railguard).
const actualizarItemOperario = async (req, res) => {
  const { itemId } = req.params;
  const { cantidad_picking, motivo_diferencia, estado, referencia_escaneada } =
    req.body;
  const usuario_id = req.usuario?.id;
  const esAdmin = req.usuario?.rol === "administrador";

  const { data: item, error: errItem } = await supabase
    .from("pedido_items")
    .select("*, pedidos(operario_id, estado, numero), productos(codigo_interno)")
    .eq("id", itemId)
    .single();
  if (errItem || !item)
    return res.status(404).json({ error: "Ítem no encontrado" });

  if (!esAdmin && item.pedidos?.operario_id !== usuario_id) {
    return res.status(403).json({ error: "Este ítem no es de tu pedido" });
  }
  if (item.pedidos?.estado === "cerrado") {
    return res.status(400).json({
      error: "El pedido está cerrado. Solo el administrador puede reabrirlo.",
    });
  }

  // Verificación de escaneo (railguard): el operario debe escanear la caja que
  // recoge de la estiba y coincidir con la referencia del pedido antes de
  // alistarla. El admin (corrección manual) queda exento.
  if (!esAdmin) {
    const refEsperada = item.referencia || item.productos?.codigo_interno;
    const { ok, resultado } = await verificarYRegistrar({
      usuario_id,
      tabla: "pedido_items",
      registro_id: itemId,
      esperada: refEsperada,
      escaneada: referencia_escaneada,
    });
    if (!ok) {
      return res.status(422).json({
        error:
          resultado === "faltante"
            ? "Debes escanear el código de barras de la caja antes de alistarla"
            : `Referencia incorrecta: escaneaste ${normalizarRef(referencia_escaneada)}, pero este ítem es ${refEsperada}`,
        resultado,
        referencia_esperada: refEsperada,
      });
    }
  }

  let cantidadFinal;
  if (cantidad_picking === undefined || cantidad_picking === null) {
    cantidadFinal = item.cantidad_pedida;
  } else {
    cantidadFinal = toFiniteNumber(cantidad_picking);
    if (cantidadFinal === null) {
      return res.status(400).json({ error: "Cantidad inválida" });
    }
  }

  if (cantidadFinal < 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }
  if (cantidadFinal !== item.cantidad_pedida && !motivo_diferencia?.trim()) {
    return res.status(400).json({
      error: "Debe indicar un motivo si la cantidad difiere de la pedida",
    });
  }

  const { data, error } = await supabase
    .from("pedido_items")
    .update({
      cantidad_picking: cantidadFinal,
      motivo_diferencia:
        cantidadFinal !== item.cantidad_pedida
          ? motivo_diferencia.trim()
          : null,
      estado: estado || "listo",
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "PICKING_OPERARIO",
    tabla: "pedido_items",
    registro_id: itemId,
    valores_antes: {
      cantidad_picking: item.cantidad_picking,
      estado: item.estado,
    },
    valores_despues: {
      cantidad_picking: cantidadFinal,
      motivo: data.motivo_diferencia,
      estado: data.estado,
      pedido_numero: item.pedidos?.numero,
    },
  });

  return res.json({ data, mensaje: "Ítem actualizado" });
};

// El operario cierra el pedido. Una vez cerrado no puede editarlo (railguard).
// Notifica a facturación.
const cerrarPedido = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("*, pedido_items(id, estado, cantidad_pedida, cantidad_picking)")
    .eq("id", id)
    .single();
  if (error || !pedido)
    return res.status(404).json({ error: "Pedido no encontrado" });

  if (req.usuario?.rol !== "administrador" &&
      pedido.operario_id !== usuario_id) {
    return res.status(403).json({ error: "Este pedido no es tuyo" });
  }
  if (pedido.estado === "cerrado" || pedido.facturado) {
    return res.status(400).json({ error: "El pedido ya está cerrado" });
  }

  const pendientes = (pedido.pedido_items || []).filter(
    (i) => i.estado !== "listo",
  );
  if (pendientes.length > 0) {
    return res.status(400).json({
      error: `Faltan ${pendientes.length} referencia(s) por marcar como listas`,
    });
  }

  const ahora = new Date().toISOString();
  const { error: errUpd } = await supabase
    .from("pedidos")
    .update({
      estado: "cerrado",
      hora_cierre: ahora,
      hora_finalizacion: ahora,
      cerrado_por: usuario_id,
    })
    .eq("id", id);
  if (errUpd) return sendServerError(res, errUpd, req);

  // Notifica a todos los usuarios de facturación.
  const { data: facturadores } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "facturacion")
    .eq("activo", true);

  if (facturadores && facturadores.length > 0) {
    await supabase.from("notificaciones").insert(
      facturadores.map((f) => ({
        usuario_id: f.id,
        tipo: "pedido_cerrado",
        titulo: "Pedido listo para facturar",
        mensaje: `El pedido ${pedido.numero} fue cerrado por el operario`,
        datos: { pedido_id: id, pedido_numero: pedido.numero },
      })),
    );
  }

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "CIERRE_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: pedido.estado },
    valores_despues: { estado: "cerrado", pedido_numero: pedido.numero },
  });

  return res.json({ mensaje: "Pedido cerrado y enviado a facturación" });
};

// Solo el administrador puede reabrir un pedido cerrado (railguard).
const reabrirPedido = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("id, numero, estado, facturado")
    .eq("id", id)
    .single();
  if (error || !pedido)
    return res.status(404).json({ error: "Pedido no encontrado" });
  if (pedido.facturado) {
    return res
      .status(400)
      .json({ error: "No se puede reabrir un pedido ya facturado" });
  }
  if (pedido.estado !== "cerrado") {
    return res.status(400).json({ error: "El pedido no está cerrado" });
  }

  const { error: errUpd } = await supabase
    .from("pedidos")
    .update({ estado: "en_proceso", hora_cierre: null, cerrado_por: null })
    .eq("id", id);
  if (errUpd) return sendServerError(res, errUpd, req);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "REAPERTURA_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: "cerrado" },
    valores_despues: { estado: "en_proceso", pedido_numero: pedido.numero },
  });

  return res.json({ mensaje: "Pedido reabierto" });
};

module.exports = {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  asignarTanda,
  reasignarPedido,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
  cambiarPrioridad,
  misPedidosOperario,
  actualizarItemOperario,
  cerrarPedido,
  reabrirPedido,
};
