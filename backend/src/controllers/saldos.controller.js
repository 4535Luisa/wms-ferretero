const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");

// Semáforo de urgencia calculado desde la hora límite de despacho (railguard).
const calcularSemaforo = (horaLimite, hayUrgente) => {
  if (hayUrgente) return "rojo";
  if (!horaLimite) return "verde";
  const restanteHoras =
    (new Date(horaLimite).getTime() - Date.now()) / (1000 * 60 * 60);
  if (restanteHoras <= 2) return "rojo";
  if (restanteHoras <= 6) return "amarillo";
  return "verde";
};

// Cola de saldos consolidada por operario + producto, más las cajas de
// reposición que el montacarguista bajó con destino SALDOS y están esperando
// confirmación física.
const colaSaldos = async (req, res) => {
  const { data: saldos, error } = await supabase
    .from("saldos")
    .select("*")
    .neq("estado", "entregado")
    .order("created_at", { ascending: true });
  if (error) return sendServerError(res, error, req);

  const productoIds = [...new Set((saldos || []).map((s) => s.producto_id))];
  const operarioIds = [...new Set((saldos || []).map((s) => s.operario_id))];

  const productosMap = {};
  if (productoIds.length > 0) {
    const { data: productos } = await supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", productoIds);
    for (const p of productos || []) productosMap[p.id] = p;
  }

  const operariosMap = {};
  const horaLimitePorOperario = {};
  if (operarioIds.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", operarioIds);
    for (const u of usuarios || []) operariosMap[u.id] = u;

    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("operario_id, hora_limite, prioridad, estado")
      .in("operario_id", operarioIds)
      .in("estado", ["asignado", "en_proceso", "cerrado"]);
    for (const p of pedidos || []) {
      const cur = horaLimitePorOperario[p.operario_id] || {
        horaLimite: null,
        hayUrgente: false,
      };
      if (p.prioridad === "urgente") cur.hayUrgente = true;
      if (p.hora_limite) {
        if (!cur.horaLimite || new Date(p.hora_limite) < new Date(cur.horaLimite))
          cur.horaLimite = p.hora_limite;
      }
      horaLimitePorOperario[p.operario_id] = cur;
    }
  }

  const cola = (saldos || []).map((s) => {
    const u = horaLimitePorOperario[s.operario_id] || {};
    return {
      ...s,
      producto: productosMap[s.producto_id] || null,
      operario: operariosMap[s.operario_id] || null,
      semaforo: calcularSemaforo(u.horaLimite, u.hayUrgente),
      hora_limite: u.horaLimite || null,
    };
  });

  // Cajas de reposición entrantes (bajadas por el montacarguista, destino SALDOS).
  const { data: entrantesRaw } = await supabase
    .from("lista_picking_items")
    .select(
      "id, producto_id, referencia, descripcion, cantidad_unidades, cantidad_cajas, estado, pedido_id",
    )
    .eq("destino_saldos", true)
    .eq("estado", "bajada");

  return res.json({ cola, entrantes: entrantesRaw || [] });
};

// Saldos confirma la recepción física de una caja de reposición: el inventario
// de SALDOS sube SOLO en este momento (railguard).
const confirmarCajaSaldos = async (req, res) => {
  const { itemId } = req.params;
  const usuario_id = req.usuario?.id;

  // Suba de inventario SALDOS + marca del ítem + bitácora en UNA transacción
  // con bloqueo de filas. Ver backend/sql/2026-06-01_rpc_picking_saldos.sql
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
    mensaje: "Caja confirmada — inventario de SALDOS actualizado",
  });
};

// Saldos entrega las unidades sueltas al operario: descuenta del inventario
// de SALDOS y cierra el saldo. Nunca deja inventario en negativo (railguard).
const entregarSaldo = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  // El descuento de inventario + cierre del saldo + bitácora corren en UNA
  // transacción con bloqueo de filas (RPC entregar_saldo). Evita el doble
  // descuento bajo concurrencia. Ver backend/sql/2026-06-01_rpc_entregar_saldo.sql
  const { data, error } = await supabase.rpc("entregar_saldo", {
    p_saldo_id: id,
    p_usuario_id: usuario_id || null,
  });
  if (error) return sendServerError(res, error, req);

  const r = data || {};
  switch (r.status) {
    case "not_found":
      return res.status(404).json({ error: "Saldo no encontrado" });
    case "already_done":
      return res.status(400).json({ error: "Este saldo ya fue entregado" });
    case "no_saldos_bodega":
      return res.status(500).json({ error: "Bodega SALDOS no configurada" });
    case "insufficient_stock":
      return res.status(400).json({
        error: `Stock insuficiente en SALDOS (disponible ${r.antes}, requerido ${r.requerido}). Confirma primero la caja de reposición.`,
      });
    case "ok":
      break;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }

  // Notificación al operario: no crítica, se deja fuera de la transacción.
  await supabase.from("notificaciones").insert({
    usuario_id: r.operario_id,
    tipo: "saldo_entregado",
    titulo: "Saldo listo",
    mensaje: "Las unidades sueltas de tu pedido están listas en saldos",
    datos: { producto_id: r.producto_id, cantidad: r.cantidad },
  });

  return res.json({ mensaje: "Saldo entregado al operario" });
};

module.exports = { colaSaldos, confirmarCajaSaldos, entregarSaldo };
