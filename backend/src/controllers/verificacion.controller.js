const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const {
  verificarYRegistrar,
  normalizarRef,
  resolverCodigoEscaneado,
} = require("../utils/escaneo");

// Pedidos cerrados por el operario que esperan verificacion fisica del jefe de
// bodega antes de pasar a facturacion. Aislamiento por bodega.
const listarPorVerificar = async (req, res) => {
  const { rol, bodega_id } = req.usuario || {};

  let query = supabase
    .from("pedidos")
    .select(
      "*, pedido_items(*, productos(codigo_interno, descripcion_corta, ean14, unidad_empaque))",
    )
    .eq("estado", "cerrado")
    .order("hora_cierre", { ascending: true });

  if (rol === "jefe_bodega" && bodega_id) {
    query = query.or(`bodega_id.eq.${bodega_id},bodega_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

// Detalle de un pedido para verificar
const detalleVerificacion = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "*, pedido_items(*, productos(codigo_interno, descripcion_corta, ean14, unidad_empaque))",
    )
    .eq("id", id)
    .single();
  if (error || !data)
    return res.status(404).json({ error: "Pedido no encontrado" });
  return res.json(data);
};

// El jefe escanea una caja (EAN14). Cada escaneo acumula unidades (unidad_empaque
// por escaneo). Cuando unidades_verificadas >= cantidad_picking, el item queda
// verificado. Los saldos (cantidad_saldos) se confirman aparte con confirmacion
// manual de cantidad.
const verificarItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { referencia_escaneada: refRaw } = req.body || {};
  const usuario_id = req.usuario?.id;

  // Resolver EAN14 -> codigo_interno
  const codigoResuelto = await resolverCodigoEscaneado(refRaw || "");

  const { data: item } = await supabase
    .from("pedido_items")
    .select(
      "id, pedido_id, cantidad_pedida, cantidad_picking, cantidad_saldos, unidades_verificadas, verificado, productos(codigo_interno, ean14, unidad_empaque), pedidos(estado)",
    )
    .eq("id", itemId)
    .eq("pedido_id", id)
    .single();

  if (!item) return res.status(404).json({ error: "Item no encontrado" });
  if (item.pedidos?.estado !== "cerrado") {
    return res.status(400).json({
      error: "Solo se pueden verificar pedidos cerrados",
    });
  }
  if (item.verificado) {
    return res.status(400).json({ error: "Este item ya fue verificado" });
  }

  // Validar que el codigo escaneado corresponde a este item
  const refEsperada = item.productos?.codigo_interno;
  const { ok } = await verificarYRegistrar({
    usuario_id,
    tabla: "pedido_items",
    registro_id: itemId,
    esperada: refEsperada,
    escaneada: codigoResuelto,
  });

  if (!ok) {
    return res.status(422).json({
      error: `Referencia incorrecta: escaneaste ${normalizarRef(codigoResuelto)}, pero este item es ${refEsperada}`,
      referencia_esperada: refEsperada,
    });
  }

  // Acumular unidades: cada escaneo suma unidad_empaque del producto
  const ue = item.productos?.unidad_empaque || 1;
  const cantidadCajas = item.cantidad_picking ?? item.cantidad_pedida;
  const cantidadSaldos = item.cantidad_saldos || 0;
  // Unidades de cajas completas (sin contar saldos)
  const unidadesCajas = cantidadCajas - cantidadSaldos;
  const yaVerificadas = item.unidades_verificadas || 0;
  const nuevasUnidades = yaVerificadas + ue;

  // Verificar si con este escaneo se completan las cajas
  const cajasCompletas = unidadesCajas > 0 ? Math.ceil(unidadesCajas / ue) : 0;
  const cajasVerificadas = Math.floor(nuevasUnidades / ue);
  const cajasListas = cajasVerificadas >= cajasCompletas;

  // Si no quedan saldos pendientes y las cajas estan listas -> verificado completo
  const verificadoCompleto = cajasListas && cantidadSaldos === 0;

  await supabase
    .from("pedido_items")
    .update({
      unidades_verificadas: nuevasUnidades,
      verificado: verificadoCompleto,
    })
    .eq("id", itemId);

  // Progreso general del pedido
  const { data: items } = await supabase
    .from("pedido_items")
    .select("verificado, saldo_verificado")
    .eq("pedido_id", id);

  const total = (items || []).length;
  const verificados = (items || []).filter(
    (i) => i.verificado && i.saldo_verificado !== false,
  ).length;

  return res.json({
    mensaje: cajasListas
      ? "Cajas completas verificadas"
      : `Caja escaneada (${cajasVerificadas}/${cajasCompletas})`,
    cajasVerificadas,
    cajasCompletas,
    cajasListas,
    verificadoCompleto,
    verificados,
    total,
  });
};

// El jefe confirma manualmente los saldos de un item (unidades sueltas que
// vienen de bodega saldos). No se escanean caja a caja sino que se digita
// la cantidad recibida.
const confirmarSaldoItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { cantidad_saldo_recibida } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (
    cantidad_saldo_recibida === undefined ||
    cantidad_saldo_recibida === null
  ) {
    return res
      .status(400)
      .json({ error: "cantidad_saldo_recibida es requerida" });
  }

  const { data: item } = await supabase
    .from("pedido_items")
    .select("id, pedido_id, cantidad_saldos, pedidos(estado)")
    .eq("id", itemId)
    .eq("pedido_id", id)
    .single();

  if (!item) return res.status(404).json({ error: "Item no encontrado" });
  if (item.pedidos?.estado !== "cerrado") {
    return res.status(400).json({ error: "Solo pedidos cerrados" });
  }

  const cantRecibida = Number(cantidad_saldo_recibida);
  const cantEsperada = item.cantidad_saldos || 0;

  // Marcar saldo como verificado (aunque sea con diferencia)
  const updates = {
    saldo_verificado: true,
    cantidad_saldo_recibida: cantRecibida,
  };

  // Si las cajas ya estaban listas, marcar item completo
  const { data: itemActual } = await supabase
    .from("pedido_items")
    .select(
      "unidades_verificadas, cantidad_picking, cantidad_saldos, productos(unidad_empaque)",
    )
    .eq("id", itemId)
    .single();

  if (itemActual) {
    const ue = itemActual.productos?.unidad_empaque || 1;
    const cantPicking = itemActual.cantidad_picking ?? 0;
    const cantSaldos = itemActual.cantidad_saldos || 0;
    const unidadesCajas = cantPicking - cantSaldos;
    const cajasCompletas =
      unidadesCajas > 0 ? Math.ceil(unidadesCajas / ue) : 0;
    const cajasVerificadas = Math.floor(
      (itemActual.unidades_verificadas || 0) / ue,
    );
    const cajasListas =
      cajasVerificadas >= cajasCompletas || cajasCompletas === 0;

    if (cajasListas) {
      updates.verificado = true;
    }
  }

  if (cantRecibida !== cantEsperada) {
    updates.motivo_diferencia = `Saldo esperado: ${cantEsperada} u, recibido: ${cantRecibida} u`;
  }

  await supabase.from("pedido_items").update(updates).eq("id", itemId);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "VERIFICACION_SALDO",
    tabla: "pedido_items",
    registro_id: itemId,
    valores_antes: { cantidad_saldos: cantEsperada },
    valores_despues: { cantidad_saldo_recibida: cantRecibida },
  });

  return res.json({
    mensaje:
      cantRecibida === cantEsperada
        ? "Saldo verificado correctamente"
        : `Saldo con diferencia: esperado ${cantEsperada}, recibido ${cantRecibida}`,
    diferencia: cantEsperada - cantRecibida,
  });
};

// Confirma la verificacion completa: todos los items deben estar verificados
// (cajas + saldos). Pasa el pedido a 'verificado' y notifica a facturacion.
const confirmarVerificacion = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select(
      "id, numero, estado, pedido_items(id, verificado, cantidad_saldos, saldo_verificado)",
    )
    .eq("id", id)
    .single();

  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
  if (pedido.estado !== "cerrado") {
    return res.status(400).json({
      error: "Solo se pueden confirmar pedidos cerrados",
    });
  }

  const items = pedido.pedido_items || [];

  // Un item esta listo si:
  // - verificado = true
  // - Si tiene saldos: saldo_verificado = true tambien
  const pendientes = items.filter((i) => {
    if (!i.verificado) return true;
    if ((i.cantidad_saldos || 0) > 0 && !i.saldo_verificado) return true;
    return false;
  });

  if (items.length === 0 || pendientes.length > 0) {
    return res.status(400).json({
      error: `Faltan ${pendientes.length} item(s) por verificar`,
    });
  }

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("pedidos")
    .update({
      estado: "verificado",
      hora_verificacion: ahora,
      verificado_por: usuario_id,
    })
    .eq("id", id);

  if (error) return sendServerError(res, error, req);

  // Notificar a facturacion
  const { data: facturadores } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "facturacion")
    .eq("activo", true);

  if (facturadores?.length > 0) {
    await supabase.from("notificaciones").insert(
      facturadores.map((f) => ({
        usuario_id: f.id,
        tipo: "pedido_por_verificar",
        titulo: "Pedido listo para facturar",
        mensaje: `El pedido ${pedido.numero} fue verificado y esta listo para facturar`,
        datos: { pedido_id: id, pedido_numero: pedido.numero },
      })),
    );
  }

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "VERIFICACION_PEDIDO",
    tabla: "pedidos",
    registro_id: id,
    valores_antes: { estado: "cerrado" },
    valores_despues: { estado: "verificado", pedido_numero: pedido.numero },
  });

  return res.json({ mensaje: "Pedido verificado y enviado a facturacion" });
};

// Registra una diferencia cuando falta una caja — el jefe aprueba con lo que hay
const registrarDiferencia = async (req, res) => {
  const { id, itemId } = req.params;
  const { cantidad_real, motivo } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (!cantidad_real || !motivo?.trim()) {
    return res
      .status(400)
      .json({ error: "cantidad_real y motivo son requeridos" });
  }

  const { data: item } = await supabase
    .from("pedido_items")
    .select(
      "id, pedido_id, producto_id, cantidad_pedida, cantidad_picking, pedidos(estado, numero)",
    )
    .eq("id", itemId)
    .eq("pedido_id", id)
    .single();

  if (!item) return res.status(404).json({ error: "Item no encontrado" });
  if (item.pedidos?.estado !== "cerrado") {
    return res
      .status(400)
      .json({
        error: "Solo se pueden registrar diferencias en pedidos cerrados",
      });
  }

  const cantidadPedida = item.cantidad_pedida || 0;
  const cantidadReal = Number(cantidad_real);

  if (cantidadReal >= cantidadPedida) {
    return res.status(400).json({
      error:
        "La cantidad real no puede ser mayor o igual a la pedida si hay diferencia",
    });
  }

  await supabase.from("pedido_diferencias").insert({
    pedido_id: id,
    pedido_item_id: itemId,
    producto_id: item.producto_id,
    cantidad_pedida: cantidadPedida,
    cantidad_real: cantidadReal,
    motivo: motivo.trim(),
    aprobado_por: usuario_id,
    fecha_aprobacion: new Date().toISOString(),
  });

  await supabase
    .from("pedido_items")
    .update({
      cantidad_picking: cantidadReal,
      verificado: true,
      saldo_verificado: true,
      motivo_diferencia: motivo.trim(),
    })
    .eq("id", itemId);

  await supabase
    .from("pedidos")
    .update({ estado: "con_diferencia" })
    .eq("id", id)
    .eq("estado", "cerrado");

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "DIFERENCIA_VERIFICACION",
    tabla: "pedido_items",
    registro_id: itemId,
    valores_antes: { cantidad_pedida: cantidadPedida },
    valores_despues: {
      cantidad_real: cantidadReal,
      diferencia: cantidadPedida - cantidadReal,
      motivo: motivo.trim(),
      pedido_numero: item.pedidos?.numero,
    },
  });

  return res.json({
    mensaje: `Diferencia registrada: pedido ${cantidadPedida}, real ${cantidadReal}`,
  });
};

// Confirma verificacion con diferencias
const confirmarConDiferencias = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, numero, estado, pedido_items(id, verificado)")
    .eq("id", id)
    .single();

  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
  if (!["cerrado", "con_diferencia"].includes(pedido.estado)) {
    return res.status(400).json({
      error: "El pedido debe estar cerrado o con diferencia",
    });
  }

  const items = pedido.pedido_items || [];
  const pendientes = items.filter((i) => !i.verificado);
  if (pendientes.length > 0) {
    return res.status(400).json({
      error: `Faltan ${pendientes.length} item(s) por verificar o registrar diferencia`,
    });
  }

  await supabase
    .from("pedidos")
    .update({
      estado: "verificado",
      hora_verificacion: new Date().toISOString(),
      verificado_por: usuario_id,
    })
    .eq("id", id);

  const { data: facturadores } = await supabase
    .from("usuarios")
    .select("id")
    .eq("rol", "facturacion")
    .eq("activo", true);

  if (facturadores?.length > 0) {
    await supabase.from("notificaciones").insert(
      facturadores.map((f) => ({
        usuario_id: f.id,
        tipo: "pedido_por_verificar",
        titulo: "Pedido listo para facturar",
        mensaje: `El pedido ${pedido.numero} fue verificado y esta listo para facturar`,
        datos: { pedido_id: id, pedido_numero: pedido.numero },
      })),
    );
  }

  return res.json({
    mensaje: `Pedido ${pedido.numero} verificado y enviado a facturacion`,
  });
};

module.exports = {
  listarPorVerificar,
  detalleVerificacion,
  verificarItem,
  confirmarSaldoItem,
  confirmarVerificacion,
  registrarDiferencia,
  confirmarConDiferencias,
};
