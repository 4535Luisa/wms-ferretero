const supabase = require("../utils/supabase");
const { ORDEN_BODEGAS, splitCajaSaldo } = require("../utils/picking");
const { sendServerError } = require("../utils/errors");
const { verificarYRegistrar, normalizarRef } = require("../utils/escaneo");

const generarListasPicking = async (req, res) => {
  const { pedido_ids } = req.body;
  if (!pedido_ids || pedido_ids.length === 0)
    return res.status(400).json({ error: "No hay pedidos para procesar" });

  // Idempotencia: omite pedidos que YA tienen ítems de picking generados.
  const { data: yaGenerados } = await supabase
    .from("lista_picking_items")
    .select("pedido_id")
    .in("pedido_id", pedido_ids);
  const conPicking = new Set((yaGenerados || []).map((i) => i.pedido_id));
  const pedidosAProcesar = pedido_ids.filter((id) => !conPicking.has(id));
  if (pedidosAProcesar.length === 0) {
    return res.json({
      listas: [],
      mensaje: "Los pedidos seleccionados ya tienen listas generadas",
    });
  }

  // Bodegas (incl. SALDOS) en una sola consulta.
  const { data: bodegasData } = await supabase
    .from("bodegas")
    .select("id, codigo")
    .in("codigo", [...ORDEN_BODEGAS, "SALDOS"]);
  const codigoToId = {};
  for (const b of bodegasData || []) codigoToId[b.codigo] = b.id;
  const bodegaIds = {};
  for (const codigo of ORDEN_BODEGAS)
    bodegaIds[codigo] = codigoToId[codigo] || null;

  // Mapa de ubicaciones (id -> codigo) de las bodegas de picking.
  const bodegaIdList = ORDEN_BODEGAS.map((c) => bodegaIds[c]).filter(Boolean);
  const ubicMap = {};
  if (bodegaIdList.length > 0) {
    const { data: ubics } = await supabase
      .from("ubicaciones")
      .select("id, codigo")
      .in("bodega_id", bodegaIdList);
    for (const u of ubics || []) ubicMap[u.id] = u.codigo;
  }

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

  // Todos los pedidos con sus ítems en una sola consulta.
  const { data: pedidosData } = await supabase
    .from("pedidos")
    .select(
      "*, pedido_items(*, productos(codigo_interno, descripcion_corta, unidad_empaque))",
    )
    .in("id", pedidosAProcesar);
  const pedidosMap = {};
  for (const p of pedidosData || []) pedidosMap[p.id] = p;

  // Acumula advertencias de stock insuficiente para devolver al jefe de bodega.
  const advertencias = [];

  for (const pedidoId of pedidosAProcesar) {
    const pedido = pedidosMap[pedidoId];
    if (!pedido) continue;

    for (const item of pedido.pedido_items || []) {
      const unidadEmpaque = item.productos?.unidad_empaque || 0;
      const ref = item.productos?.codigo_interno || item.producto_id;
      const desc = item.productos?.descripcion_corta || ref;
      const { cajasCompletas, unidadesSueltas } = splitCajaSaldo(
        item.cantidad_pedida,
        unidadEmpaque,
      );

      // Sin unidad_empaque o sin cajas completas: va todo a SALDOS.
      if (cajasCompletas === 0) {
        if (item.cantidad_pedida > 0) {
          advertencias.push({
            pedido_numero: pedido.numero,
            referencia: ref,
            descripcion: desc,
            cantidad_pedida: item.cantidad_pedida,
            cajas_requeridas: 0,
            cajas_disponibles: 0,
            motivo:
              "Sin unidad de empaque definida o cantidad menor a 1 caja — se resolverá como saldo",
          });
        }
        continue;
      }

      let cajasRestantes = cajasCompletas;
      let cajasReservadas = 0;

      for (const codigo of ORDEN_BODEGAS) {
        if (cajasRestantes <= 0) break;
        const bodegaId = bodegaIds[codigo];
        if (!bodegaId) continue;

        const { data: invs } = await supabase
          .from("inventario")
          .select(
            "id, cantidad_disponible, cantidad_comprometida, ubicacion_id",
          )
          .eq("producto_id", item.producto_id)
          .eq("bodega_id", bodegaId)
          .gt("cantidad_disponible", 0)
          .order("cantidad_disponible", { ascending: true });

        for (const inv of invs || []) {
          if (cajasRestantes <= 0) break;
          const disponibleReal =
            inv.cantidad_disponible - (inv.cantidad_comprometida || 0);
          let cajasDisponibles = Math.floor(disponibleReal / unidadEmpaque);
          if (cajasDisponibles <= 0) continue;

          let cajasATomar = 0;
          let unidadesATomar = 0;
          for (let intento = 0; intento < 2; intento++) {
            const cajas = Math.min(cajasRestantes, cajasDisponibles);
            if (cajas <= 0) break;
            const unidades = cajas * unidadEmpaque;
            const { data: rsv } = await supabase.rpc(
              "reservar_inventario_picking",
              { p_inventario_id: inv.id, p_unidades: unidades },
            );
            if (rsv?.status === "ok") {
              cajasATomar = cajas;
              unidadesATomar = unidades;
              break;
            }
            if (rsv?.status === "insufficient") {
              cajasDisponibles = Math.floor(
                (rsv.disponible || 0) / unidadEmpaque,
              );
              continue;
            }
            break;
          }
          if (cajasATomar <= 0) continue;

          const ubicCodigo = inv.ubicacion_id
            ? ubicMap[inv.ubicacion_id] || null
            : null;

          listasPorBodega[bodegaId].items.push({
            pedido_id: pedidoId,
            pedido_numero: pedido.numero,
            producto_id: item.producto_id,
            ubicacion_id: inv.ubicacion_id,
            ubicacion_codigo: ubicCodigo,
            referencia: ref,
            descripcion: desc,
            cantidad_cajas: cajasATomar,
            cantidad_unidades: unidadesATomar,
            destino_saldos: false,
            wave_id: null,
          });
          cajasReservadas += cajasATomar;
          cajasRestantes -= cajasATomar;
        }
      }

      // Si no se pudo reservar todas las cajas requeridas, genera advertencia.
      if (cajasRestantes > 0) {
        advertencias.push({
          pedido_numero: pedido.numero,
          referencia: ref,
          descripcion: desc,
          cantidad_pedida: item.cantidad_pedida,
          cajas_requeridas: cajasCompletas,
          cajas_disponibles: cajasReservadas,
          cajas_faltantes: cajasRestantes,
          motivo:
            cajasReservadas === 0
              ? "Sin stock en bodegas de picking — se alistara lo que haya en saldos"
              : `Stock parcial: se reservaron ${cajasReservadas} de ${cajasCompletas} cajas requeridas`,
        });
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

    // Asignar wave_id por referencia + ubicacion
    const waveMap = {};
    let waveCounter = 1;
    for (const item of lista.items) {
      const key = item.producto_id + "|" + (item.ubicacion_id || "");
      if (!waveMap[key])
        waveMap[key] = "W" + String(waveCounter++).padStart(3, "0");
      item.wave_id = waveMap[key];
    }

    // Expandir items: 1 registro por caja fisica
    const itemsExpandidos = [];
    for (const item of lista.items) {
      const numCajas = item.cantidad_cajas || 1;
      for (let c = 0; c < numCajas; c++) {
        itemsExpandidos.push({
          lista_id: listaCreada.id,
          pedido_id: item.pedido_id,
          producto_id: item.producto_id,
          ubicacion_id: item.ubicacion_id,
          ubicacion_codigo: item.ubicacion_codigo,
          referencia: item.referencia,
          descripcion: item.descripcion,
          cantidad_cajas: 1,
          cantidad_unidades: item.cantidad_unidades,
          destino_saldos: item.destino_saldos,
          wave_id: item.wave_id,
          estado: "pendiente",
        });
      }
    }
    await supabase.from("lista_picking_items").insert(itemsExpandidos);

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
    advertencias,
    mensaje:
      listasCreadas.length > 0
        ? `${listasCreadas.length} listas de picking generadas${advertencias.length > 0 ? ` — ${advertencias.length} referencia(s) con stock insuficiente` : ""}`
        : advertencias.length > 0
          ? "No se generaron listas — sin stock en bodegas de picking"
          : "Sin items para generar",
  });
};

const enriquecerItems = async (items) => {
  if (!items || items.length === 0) return [];
  const pedidoIds = [
    ...new Set(items.filter((i) => i.pedido_id).map((i) => i.pedido_id)),
  ];
  const { data: pedidos } =
    pedidoIds.length > 0
      ? await supabase.from("pedidos").select("id, numero").in("id", pedidoIds)
      : { data: [] };
  const pedMap = Object.fromEntries((pedidos || []).map((p) => [p.id, p]));

  return items.map((item) => ({
    ...item,
    ubicacion_codigo: item.ubicacion_codigo || null,
    pedidos: item.pedido_id ? pedMap[item.pedido_id] : null,
  }));
};

const listarListasPicking = async (req, res) => {
  const { data: listas, error } = await supabase
    .from("listas_picking")
    .select("*, bodegas(nombre, codigo), usuarios(nombre)")
    .order("created_at", { ascending: false });
  if (error) return sendServerError(res, error, req);
  if (!listas || listas.length === 0) return res.json([]);

  const listaIds = listas.map((l) => l.id);
  const { data: items } = await supabase
    .from("lista_picking_items")
    .select("*")
    .in("lista_id", listaIds);

  const itemsEnriquecidos = await enriquecerItems(items || []);
  const listasPorId = Object.fromEntries(
    listas.map((l) => [l.id, { ...l, lista_picking_items: [] }]),
  );
  for (const item of itemsEnriquecidos) {
    if (listasPorId[item.lista_id])
      listasPorId[item.lista_id].lista_picking_items.push(item);
  }

  return res.json(Object.values(listasPorId));
};

const misListas = async (req, res) => {
  const usuario_id = req.usuario?.id;

  const { data: listas, error } = await supabase
    .from("listas_picking")
    .select("*, bodegas(nombre, codigo)")
    .eq("montacarguista_id", usuario_id)
    .in("estado", ["asignada", "en_proceso"])
    .order("created_at", { ascending: false });
  if (error) return sendServerError(res, error, req);
  if (!listas || listas.length === 0) return res.json([]);

  const listaIds = listas.map((l) => l.id);
  const { data: items } = await supabase
    .from("lista_picking_items")
    .select("*")
    .in("lista_id", listaIds);

  const itemsEnriquecidos = await enriquecerItems(items || []);
  const listasPorId = Object.fromEntries(
    listas.map((l) => [l.id, { ...l, lista_picking_items: [] }]),
  );
  for (const item of itemsEnriquecidos) {
    if (listasPorId[item.lista_id])
      listasPorId[item.lista_id].lista_picking_items.push(item);
  }

  return res.json(Object.values(listasPorId));
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
  if (error) return sendServerError(res, error, req);

  await supabase.from("notificaciones").insert({
    usuario_id: montacarguista_id,
    tipo: "lista_asignada",
    titulo: "Lista de picking asignada",
    mensaje: "Tienes una nueva lista de cajas para bajar",
    datos: { lista_id: id },
  });

  return res.json({ data, mensaje: "Montacarguista asignado correctamente" });
};

const bajarCaja = async (req, res) => {
  const { id } = req.params;
  const { estiba_id, referencia_escaneada, metodo } = req.body || {};
  const usuario_id = req.usuario?.id;
  const esAdmin = req.usuario?.rol === "administrador";
  const metodoCaptura = metodo === "camara" ? "camara" : "teclado";

  const { data: item } = await supabase
    .from("lista_picking_items")
    .select("*, productos(codigo_interno)")
    .eq("id", id)
    .single();
  if (!item) return res.status(404).json({ error: "Item no encontrado" });

  if (item.estado !== "pendiente") {
    return res.status(400).json({ error: "Esta caja ya fue bajada" });
  }

  const refEsperada = item.referencia || item.productos?.codigo_interno;
  const { ok, resultado } = await verificarYRegistrar({
    usuario_id,
    tabla: "lista_picking_items",
    registro_id: id,
    esperada: refEsperada,
    escaneada: referencia_escaneada,
    metodo: metodoCaptura,
  });
  if (!ok) {
    return res.status(422).json({
      error:
        resultado === "faltante"
          ? "Debes escanear el codigo de barras de la caja antes de bajarla"
          : `Caja incorrecta: escaneaste ${normalizarRef(referencia_escaneada)}, pero esta linea es ${refEsperada}`,
      resultado,
      referencia_esperada: refEsperada,
    });
  }

  if (estiba_id) {
    const { data: estiba } = await supabase
      .from("estibas")
      .select("id, foto_url")
      .eq("id", estiba_id)
      .single();
    if (!estiba || !estiba.foto_url) {
      return res
        .status(400)
        .json({ error: "La estiba no existe o no tiene foto registrada" });
    }
  }

  const { data: lista } = await supabase
    .from("listas_picking")
    .select("id, montacarguista_id")
    .eq("id", item.lista_id)
    .single();
  if (!esAdmin && lista?.montacarguista_id !== usuario_id) {
    return res.status(403).json({ error: "Esta lista no esta asignada a ti" });
  }

  const { data: rpcData, error } = await supabase.rpc("bajar_caja", {
    p_item_id: id,
    p_usuario_id: usuario_id || null,
    p_estiba_id: estiba_id || null,
  });
  if (error) return sendServerError(res, error, req);
  const r = rpcData || {};
  if (r.status === "not_found")
    return res.status(404).json({ error: "Item no encontrado" });
  if (r.status === "already_done")
    return res.status(400).json({ error: "Esta caja ya fue bajada" });
  if (r.status !== "ok")
    return res.status(500).json({ error: "Error procesando la solicitud" });

  const datosNotif = {
    pedido_id: item.pedido_id,
    producto_id: item.producto_id,
    referencia: item.productos?.codigo_interno,
    destino_saldos: item.destino_saldos,
  };

  if (item.pedido_id) {
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("operario_id, numero")
      .eq("id", item.pedido_id)
      .single();
    if (pedido?.operario_id) {
      await supabase.from("notificaciones").insert({
        usuario_id: pedido.operario_id,
        tipo: "caja_bajada",
        titulo: "Caja bajada",
        mensaje: `Se bajo una caja de ${item.descripcion}`,
        datos: { ...datosNotif, pedido_numero: pedido.numero },
      });
    }
  }

  if (item.destino_saldos) {
    const { data: saldosUsers } = await supabase
      .from("usuarios")
      .select("id")
      .eq("rol", "saldos")
      .eq("activo", true);
    if (saldosUsers && saldosUsers.length > 0) {
      await supabase.from("notificaciones").insert(
        saldosUsers.map((u) => ({
          usuario_id: u.id,
          tipo: "caja_saldos_entrante",
          titulo: "Caja con destino SALDOS",
          mensaje: `Llego una caja de ${item.descripcion} para confirmar`,
          datos: datosNotif,
        })),
      );
    }
  }

  if (item.lista_id) {
    const { data: pendientes } = await supabase
      .from("lista_picking_items")
      .select("id")
      .eq("lista_id", item.lista_id)
      .eq("estado", "pendiente");
    await supabase
      .from("listas_picking")
      .update({
        estado: (pendientes || []).length === 0 ? "completada" : "en_proceso",
      })
      .eq("id", item.lista_id);
  }

  return res.json({
    mensaje: "Caja registrada como bajada e inventario actualizado",
  });
};

const crearEstiba = async (req, res) => {
  const usuario_id = req.usuario?.id;
  const { nombre, foto_url } = req.body;

  if (!nombre?.trim())
    return res
      .status(400)
      .json({ error: "El nombre de la estiba es obligatorio" });
  if (!foto_url?.trim())
    return res
      .status(400)
      .json({ error: "La foto de la estiba es obligatoria" });

  const { data, error } = await supabase
    .from("estibas")
    .insert({
      montacarguista_id: usuario_id,
      nombre: nombre.trim(),
      foto_url,
      estado: "activa",
    })
    .select("id, nombre, estado, created_at")
    .single();
  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "REGISTRO_ESTIBA",
    tabla: "estibas",
    registro_id: data.id,
    valores_despues: { nombre: data.nombre },
  });

  return res.json({ data, mensaje: "Estiba registrada" });
};

const misEstibas = async (req, res) => {
  const usuario_id = req.usuario?.id;
  const { data, error } = await supabase
    .from("estibas")
    .select("id, nombre, estado, created_at")
    .eq("montacarguista_id", usuario_id)
    .eq("estado", "activa")
    .order("created_at", { ascending: false });
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

const cancelarLista = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id || null;

  const { data, error } = await supabase.rpc("cancelar_lista_picking", {
    p_lista_id: id,
    p_usuario_id: usuario_id,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Lista no encontrada" });
    case "already_done":
      return res.status(400).json({ error: "La lista ya fue cancelada" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({
    mensaje: `Lista cancelada — ${r.items_cancelados} item(s) liberados`,
  });
};

module.exports = {
  generarListasPicking,
  listarListasPicking,
  asignarMontacarguista,
  misListas,
  bajarCaja,
  crearEstiba,
  misEstibas,
  cancelarLista,
};
