const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

// Verificar pedidos sin movimiento y generar alertas
// Se llama desde un endpoint que el frontend invoca periodicamente (cada 5 min)
const verificarPedidosDemorados = async (req, res) => {
  const HORAS_LIMITE = 2;
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - HORAS_LIMITE * 60 * 60 * 1000);

  // Pedidos activos que llevan mas de 2 horas sin cambiar de estado
  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, numero, estado, updated_at, operario_id, montacarguista_id")
    .in("estado", ["asignado", "en_picking", "en_saldos", "en_verificacion"])
    .lt("updated_at", limite.toISOString());

  if (error) return sendServerError(res, error, req);

  const alertasGeneradas = [];

  for (const pedido of pedidos || []) {
    // Verificar si ya existe una alerta activa para este pedido
    const { data: alertaExistente } = await supabase
      .from("alertas_pedido")
      .select("id, proxima_alerta")
      .eq("pedido_id", pedido.id)
      .eq("tipo", "sin_movimiento")
      .eq("leida", false)
      .single();

    if (alertaExistente) {
      // Solo renotificar si ya paso el tiempo de recordatorio
      if (new Date(alertaExistente.proxima_alerta) > ahora) continue;
    }

    // Generar o actualizar la alerta
    if (alertaExistente) {
      await supabase
        .from("alertas_pedido")
        .update({
          proxima_alerta: new Date(
            ahora.getTime() + 120 * 60 * 1000,
          ).toISOString(),
        })
        .eq("id", alertaExistente.id);
    } else {
      await supabase.from("alertas_pedido").insert({
        pedido_id: pedido.id,
        tipo: "sin_movimiento",
        mensaje: `El pedido ${pedido.numero} lleva mas de ${HORAS_LIMITE} horas en estado "${pedido.estado}" sin movimiento`,
        proxima_alerta: new Date(
          ahora.getTime() + 120 * 60 * 1000,
        ).toISOString(),
      });
    }

    // Notificar al administrador
    const { data: admins } = await supabase
      .from("usuarios")
      .select("id")
      .eq("rol", "administrador")
      .eq("activo", true);

    if (admins?.length > 0) {
      await supabase.from("notificaciones").insert(
        admins.map((a) => ({
          usuario_id: a.id,
          tipo: "pedido_demorado",
          titulo: "Pedido sin movimiento",
          mensaje: `El pedido ${pedido.numero} lleva mas de ${HORAS_LIMITE}h en estado "${pedido.estado}"`,
          datos: {
            pedido_id: pedido.id,
            pedido_numero: pedido.numero,
            estado: pedido.estado,
          },
        })),
      );
    }

    alertasGeneradas.push(pedido.numero);
  }

  return res.json({
    alertas_generadas: alertasGeneradas.length,
    pedidos: alertasGeneradas,
  });
};

// Listar alertas activas de pedidos
const listarAlertas = async (req, res) => {
  const { leida = "false", limit = 50 } = req.query;

  let query = supabase
    .from("alertas_pedido")
    .select("*, pedidos(numero, estado)")
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (leida !== "all") {
    query = query.eq("leida", leida === "true");
  }

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

// Marcar alerta como leida y configurar frecuencia de recordatorio
const marcarAlertaLeida = async (req, res) => {
  const { id } = req.params;
  const { frecuencia_minutos } = req.body || {};

  const update = { leida: true };
  if (frecuencia_minutos && Number(frecuencia_minutos) > 0) {
    update.frecuencia_recordatorio = Number(frecuencia_minutos);
    update.leida = false; // No cerrar, solo posponer
    update.proxima_alerta = new Date(
      Date.now() + Number(frecuencia_minutos) * 60 * 1000,
    ).toISOString();
  }

  const { error } = await supabase
    .from("alertas_pedido")
    .update(update)
    .eq("id", id);

  if (error) return sendServerError(res, error, req);
  return res.json({ mensaje: "Alerta actualizada" });
};

// Registrar error de escaneo
const registrarErrorEscaneo = async (req, res) => {
  const {
    pedido_id,
    pedido_item_id,
    codigo_escaneado,
    codigo_esperado,
    modulo,
  } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (!codigo_escaneado || !modulo) {
    return res
      .status(400)
      .json({ error: "codigo_escaneado y modulo son requeridos" });
  }

  const { error } = await supabase.from("errores_escaneo").insert({
    usuario_id,
    pedido_id: pedido_id || null,
    pedido_item_id: pedido_item_id || null,
    codigo_escaneado,
    codigo_esperado: codigo_esperado || null,
    modulo,
  });

  if (error) return sendServerError(res, error, req);
  return res.json({ mensaje: "Error registrado" });
};

// Reporte de errores de escaneo por usuario y pedido
const reporteErroresEscaneo = async (req, res) => {
  const {
    usuario_id,
    pedido_id,
    fecha_desde,
    fecha_hasta,
    limit = 200,
  } = req.query;

  let query = supabase
    .from("errores_escaneo")
    .select("*, usuarios(nombre, rol), pedidos(numero)")
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (usuario_id) query = query.eq("usuario_id", usuario_id);
  if (pedido_id) query = query.eq("pedido_id", pedido_id);
  if (fecha_desde) query = query.gte("created_at", fecha_desde);
  if (fecha_hasta) query = query.lte("created_at", fecha_hasta);

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);

  // Agrupar por usuario para el reporte diario
  const porUsuario = {};
  for (const e of data || []) {
    const uid = e.usuario_id;
    if (!porUsuario[uid]) {
      porUsuario[uid] = {
        usuario_id: uid,
        nombre: e.usuarios?.nombre || "Desconocido",
        rol: e.usuarios?.rol || "",
        total_errores: 0,
        errores: [],
      };
    }
    porUsuario[uid].total_errores++;
    porUsuario[uid].errores.push({
      id: e.id,
      pedido_numero: e.pedidos?.numero,
      codigo_escaneado: e.codigo_escaneado,
      codigo_esperado: e.codigo_esperado,
      modulo: e.modulo,
      created_at: e.created_at,
    });
  }

  return res.json({
    total: (data || []).length,
    por_usuario: Object.values(porUsuario).sort(
      (a, b) => b.total_errores - a.total_errores,
    ),
    detalle: data || [],
  });
};

module.exports = {
  verificarPedidosDemorados,
  listarAlertas,
  marcarAlertaLeida,
  registrarErrorEscaneo,
  reporteErroresEscaneo,
};
