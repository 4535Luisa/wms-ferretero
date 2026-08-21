const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const {
  verificarYRegistrar,
  normalizarRef,
  resolverCodigoEscaneado,
} = require("../utils/escaneo");

const calcularSemaforo = (horaLimite, hayUrgente) => {
  if (hayUrgente) return "rojo";
  if (!horaLimite) return "verde";
  const restanteHoras =
    (new Date(horaLimite).getTime() - Date.now()) / (1000 * 60 * 60);
  if (restanteHoras <= 2) return "rojo";
  if (restanteHoras <= 6) return "amarillo";
  return "verde";
};

// Lista de saldos agrupada por operario.
// Para cada operario muestra: referencias que necesita, cuánto tiene SALDOS,
// cuánto falta, y si hay cajas de reposición en camino del montacarguista.
const listaSaldosPorOperario = async (req, res) => {
  // 1. Pedidos activos con sus ítems y saldos requeridos
  const { data: pedidosData, error } = await supabase
    .from("pedidos")
    .select(
      `
      id, numero, operario_id, prioridad, hora_limite, estado,
      usuarios!pedidos_operario_id_fkey(id, nombre),
      pedido_items(
        id, producto_id, cantidad_pedida, estado,
        productos(id, codigo_interno, descripcion_corta, unidad_empaque)
      )
    `,
    )
    .in("estado", ["asignado", "en_picking", "en_saldos"])
    .not("operario_id", "is", null);

  if (error) return sendServerError(res, error, req);

  // 2. Inventario actual de SALDOS
  const { data: bodegaSaldos } = await supabase
    .from("bodegas")
    .select("id")
    .eq("codigo", "SALDOS")
    .single();

  const bodegaSaldosId = bodegaSaldos?.id;

  const { data: inventarioSaldos } = bodegaSaldosId
    ? await supabase
        .from("inventario")
        .select("producto_id, cantidad_disponible, cantidad_comprometida")
        .eq("bodega_id", bodegaSaldosId)
    : { data: [] };

  const stockSaldos = {};
  for (const inv of inventarioSaldos || []) {
    stockSaldos[inv.producto_id] =
      (inv.cantidad_disponible || 0) - (inv.cantidad_comprometida || 0);
  }

  // 3. Cajas de reposición bajadas por el montacarguista con destino SALDOS
  const { data: entrantesRaw } = await supabase
    .from("lista_picking_items")
    .select(
      "id, producto_id, referencia, descripcion, cantidad_unidades, cantidad_cajas, estado, pedido_id",
    )
    .eq("destino_saldos", true)
    .eq("estado", "bajada");

  const entrantesPorProducto = {};
  for (const e of entrantesRaw || []) {
    if (!entrantesPorProducto[e.producto_id])
      entrantesPorProducto[e.producto_id] = [];
    entrantesPorProducto[e.producto_id].push(e);
  }

  // 4. Construir lista por operario
  const porOperario = {};

  for (const pedido of pedidosData || []) {
    const operarioId = pedido.operario_id;
    if (!operarioId) continue;

    if (!porOperario[operarioId]) {
      porOperario[operarioId] = {
        operario_id: operarioId,
        operario_nombre: pedido.usuarios?.nombre || "—",
        semaforo: "verde",
        hayUrgente: false,
        horaLimite: null,
        items: [],
      };
    }

    const op = porOperario[operarioId];
    if (pedido.prioridad === "urgente") op.hayUrgente = true;
    if (pedido.hora_limite) {
      if (
        !op.horaLimite ||
        new Date(pedido.hora_limite) < new Date(op.horaLimite)
      )
        op.horaLimite = pedido.hora_limite;
    }

    for (const item of pedido.pedido_items || []) {
      if (item.estado === "completo") continue;
      const ue = item.productos?.unidad_empaque || 0;
      const cantidadPedida = item.cantidad_pedida || 0;
      const unidadesSueltas = ue > 1 ? cantidadPedida % ue : cantidadPedida;
      if (unidadesSueltas <= 0) continue;

      // ¿Cuánto tiene SALDOS para este producto?
      const stockDisponible = stockSaldos[item.producto_id] || 0;
      const faltante = Math.max(0, unidadesSueltas - stockDisponible);
      const entrantesProducto = entrantesPorProducto[item.producto_id] || [];

      op.items.push({
        pedido_id: pedido.id,
        pedido_numero: pedido.numero,
        item_id: item.id,
        producto_id: item.producto_id,
        referencia: item.productos?.codigo_interno || "—",
        descripcion: item.productos?.descripcion_corta || "—",
        unidades_requeridas: unidadesSueltas,
        stock_disponible: stockDisponible,
        faltante,
        cubierto: faltante === 0,
        entrantes: entrantesProducto,
      });
    }
  }

  // Calcular semáforo por operario
  const resultado = Object.values(porOperario)
    .filter((op) => op.items.length > 0)
    .map((op) => ({
      ...op,
      semaforo: calcularSemaforo(op.horaLimite, op.hayUrgente),
      items: op.items,
    }));

  // También devolver cajas entrantes globales para el escáner
  const entrantes = entrantesRaw || [];

  return res.json({ operarios: resultado, entrantes });
};

// Confirmar recepción de caja de reposición escaneando el código de barras
const confirmarCajaSaldos = async (req, res) => {
  const { itemId } = req.params;
  const { referencia_escaneada } = req.body || {};
  const usuario_id = req.usuario?.id;

  const { data: item } = await supabase
    .from("lista_picking_items")
    .select("referencia, productos(codigo_interno)")
    .eq("id", itemId)
    .single();
  if (!item) return res.status(404).json({ error: "Caja no encontrada" });

  const refEsperada = item.referencia || item.productos?.codigo_interno;

  // Resolver EAN-13 si aplica
  const escaneadaResuelta = await resolverCodigoEscaneado(referencia_escaneada);

  const { ok, resultado } = await verificarYRegistrar({
    usuario_id,
    tabla: "lista_picking_items",
    registro_id: itemId,
    esperada: refEsperada,
    escaneada: referencia_escaneada,
  });

  if (!ok) {
    return res.status(422).json({
      error:
        resultado === "faltante"
          ? "Debes escanear el código de barras de la caja antes de confirmarla"
          : `Caja incorrecta: escaneaste ${normalizarRef(escaneadaResuelta)}, pero esta caja es ${refEsperada}`,
      resultado,
      referencia_esperada: refEsperada,
    });
  }

  const { data, error } = await supabase.rpc("confirmar_caja_saldos", {
    p_item_id: itemId,
    p_usuario_id: usuario_id || null,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Caja no encontrada" });
    case "not_saldos":
      return res
        .status(400)
        .json({ error: "Esta caja no tiene destino SALDOS" });
    case "already_done":
      return res.status(400).json({ error: "Esta caja ya fue confirmada" });
    case "no_saldos_bodega":
      return res.status(500).json({ error: "Bodega SALDOS no configurada" });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  return res.json({
    mensaje: "✓ Caja confirmada — inventario de SALDOS actualizado",
  });
};

// Entregar unidades sueltas al operario
const entregarSaldo = async (req, res) => {
  const { producto_id, operario_id, cantidad } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (!producto_id || !operario_id || !cantidad) {
    return res
      .status(400)
      .json({ error: "producto_id, operario_id y cantidad son requeridos" });
  }

  // Verificar stock disponible en SALDOS
  const { data: bodegaSaldos } = await supabase
    .from("bodegas")
    .select("id")
    .eq("codigo", "SALDOS")
    .single();

  if (!bodegaSaldos)
    return res.status(500).json({ error: "Bodega SALDOS no configurada" });

  const { data: inv } = await supabase
    .from("inventario")
    .select("id, cantidad_disponible, cantidad_comprometida")
    .eq("producto_id", producto_id)
    .eq("bodega_id", bodegaSaldos.id)
    .single();

  if (!inv)
    return res
      .status(400)
      .json({ error: "No hay inventario de este producto en SALDOS" });

  const disponible =
    (inv.cantidad_disponible || 0) - (inv.cantidad_comprometida || 0);
  if (disponible < cantidad) {
    return res.status(400).json({
      error: `Stock insuficiente en SALDOS (disponible: ${disponible}, requerido: ${cantidad})`,
    });
  }

  // Descontar del inventario de SALDOS
  const { error: updError } = await supabase
    .from("inventario")
    .update({ cantidad_disponible: inv.cantidad_disponible - cantidad })
    .eq("id", inv.id);

  if (updError) return sendServerError(res, updError, req);

  // Registrar en bitácora
  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "ENTREGA_SALDOS",
    tabla: "inventario",
    registro_id: inv.id,
    valores_antes: { cantidad_disponible: inv.cantidad_disponible },
    valores_despues: {
      cantidad_disponible: inv.cantidad_disponible - cantidad,
    },
  });

  // Notificar al operario
  await supabase.from("notificaciones").insert({
    usuario_id: operario_id,
    tipo: "saldo_entregado",
    titulo: "Saldo listo",
    mensaje: `${cantidad} unidades listas para recoger en saldos`,
    datos: { producto_id, cantidad },
  });

  return res.json({ mensaje: "✓ Saldo entregado al operario" });
};

// Cola antigua — mantener compatibilidad
const colaSaldos = async (req, res) => {
  return listaSaldosPorOperario(req, res);
};

module.exports = {
  colaSaldos,
  listaSaldosPorOperario,
  confirmarCajaSaldos,
  entregarSaldo,
};
