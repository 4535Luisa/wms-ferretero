const supabase = require("../utils/supabase");

const getSaldosBodegaId = async () => {
  const { data } = await supabase
    .from("bodegas")
    .select("id")
    .eq("codigo", "SALDOS")
    .single();
  return data?.id || null;
};

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
  if (error) return res.status(500).json({ error: error.message });

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

  const { data: item, error } = await supabase
    .from("lista_picking_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (error || !item)
    return res.status(404).json({ error: "Caja no encontrada" });
  if (!item.destino_saldos)
    return res.status(400).json({ error: "Esta caja no tiene destino SALDOS" });
  if (item.estado === "recibida_saldos")
    return res.status(400).json({ error: "Esta caja ya fue confirmada" });

  const saldosBodegaId = await getSaldosBodegaId();
  if (!saldosBodegaId)
    return res.status(500).json({ error: "Bodega SALDOS no configurada" });

  const cantidad = item.cantidad_unidades || 0;

  const { data: invRows } = await supabase
    .from("inventario")
    .select("*")
    .eq("producto_id", item.producto_id)
    .eq("bodega_id", saldosBodegaId)
    .order("created_at", { ascending: true });
  const inv = (invRows || [])[0];

  const antes = inv?.cantidad_disponible || 0;
  const despues = antes + cantidad;

  if (inv) {
    await supabase
      .from("inventario")
      .update({ cantidad_disponible: despues })
      .eq("id", inv.id);
  } else {
    await supabase.from("inventario").insert({
      producto_id: item.producto_id,
      bodega_id: saldosBodegaId,
      cantidad_disponible: cantidad,
    });
  }

  await supabase
    .from("lista_picking_items")
    .update({ estado: "recibida_saldos" })
    .eq("id", itemId);

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "RECEPCION_SALDOS",
    tabla: "inventario",
    registro_id: item.producto_id,
    valores_antes: { cantidad_disponible: antes, bodega_id: saldosBodegaId },
    valores_despues: {
      cantidad_disponible: despues,
      bodega_id: saldosBodegaId,
      referencia: item.referencia,
      lista_picking_item_id: itemId,
    },
  });

  return res.json({
    mensaje: "Caja confirmada — inventario de SALDOS actualizado",
  });
};

// Saldos entrega las unidades sueltas al operario: descuenta del inventario
// de SALDOS y cierra el saldo. Nunca deja inventario en negativo (railguard).
const entregarSaldo = async (req, res) => {
  const { id } = req.params;
  const usuario_id = req.usuario?.id;

  const { data: saldo, error } = await supabase
    .from("saldos")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !saldo)
    return res.status(404).json({ error: "Saldo no encontrado" });
  if (saldo.estado === "entregado")
    return res.status(400).json({ error: "Este saldo ya fue entregado" });

  const saldosBodegaId = await getSaldosBodegaId();
  if (!saldosBodegaId)
    return res.status(500).json({ error: "Bodega SALDOS no configurada" });

  const cantidad = saldo.cantidad_total || 0;

  const { data: invRows } = await supabase
    .from("inventario")
    .select("*")
    .eq("producto_id", saldo.producto_id)
    .eq("bodega_id", saldosBodegaId)
    .order("created_at", { ascending: true });
  const inv = (invRows || [])[0];

  const antes = inv?.cantidad_disponible || 0;
  if (antes < cantidad) {
    return res.status(400).json({
      error: `Stock insuficiente en SALDOS (disponible ${antes}, requerido ${cantidad}). Confirma primero la caja de reposición.`,
    });
  }
  const despues = antes - cantidad;

  await supabase
    .from("inventario")
    .update({ cantidad_disponible: despues })
    .eq("id", inv.id);

  await supabase
    .from("saldos")
    .update({ estado: "entregado" })
    .eq("id", id);

  await supabase.from("notificaciones").insert({
    usuario_id: saldo.operario_id,
    tipo: "saldo_entregado",
    titulo: "Saldo listo",
    mensaje: "Las unidades sueltas de tu pedido están listas en saldos",
    datos: { producto_id: saldo.producto_id, cantidad },
  });

  await supabase.from("bitacora").insert({
    usuario_id,
    accion: "ENTREGA_SALDOS",
    tabla: "inventario",
    registro_id: saldo.producto_id,
    valores_antes: { cantidad_disponible: antes, bodega_id: saldosBodegaId },
    valores_despues: {
      cantidad_disponible: despues,
      bodega_id: saldosBodegaId,
      operario_id: saldo.operario_id,
      saldo_id: id,
    },
  });

  return res.json({ mensaje: "Saldo entregado al operario" });
};

module.exports = { colaSaldos, confirmarCajaSaldos, entregarSaldo };
