const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { resolverCodigoEscaneado, normalizarRef } = require("../utils/escaneo");

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Detecta si un código escaneado es una ubicación (formato UB-xxx)
const esCodigoUbicacion = (codigo) => /^UB-/i.test(String(codigo).trim());
const extraerCodigoUbicacion = (codigo) =>
  String(codigo).trim().replace(/^UB-/i, "").toUpperCase();

// Busca una ubicación por su código de barras o código directo
const buscarUbicacion = async (codigoEscaneado) => {
  const raw = String(codigoEscaneado).trim();
  const codigo = esCodigoUbicacion(raw)
    ? extraerCodigoUbicacion(raw)
    : raw.toUpperCase();
  const { data } = await supabase
    .from("ubicaciones")
    .select("id, codigo, bodega_id, bodegas(codigo, nombre)")
    .ilike("codigo", codigo)
    .single();
  return data || null;
};

// Busca un producto por código de barras o código interno
const buscarProductoPorEscaneo = async (codigoEscaneado) => {
  const codigoResuelto = await resolverCodigoEscaneado(codigoEscaneado);
  const { data } = await supabase
    .from("productos")
    .select(
      "id, codigo_interno, descripcion_corta, unidad_empaque, codigo_barras",
    )
    .or(
      `codigo_interno.ilike.${codigoResuelto},codigo_barras.eq.${codigoEscaneado}`,
    )
    .eq("activo", true)
    .single();
  return data || null;
};

// Registra un movimiento en la tabla movimientos_ubicacion
const registrarMovimiento = async ({
  usuario_id,
  tipo,
  producto_id,
  bodega_id,
  ubicacion_origen_id,
  ubicacion_destino_id,
  cantidad_cajas,
  cantidad_unidades,
  observacion,
}) => {
  await supabase.from("movimientos_ubicacion").insert({
    usuario_id,
    tipo,
    producto_id,
    bodega_id,
    ubicacion_origen_id: ubicacion_origen_id || null,
    ubicacion_destino_id: ubicacion_destino_id || null,
    cantidad_cajas: cantidad_cajas || 1,
    cantidad_unidades: cantidad_unidades || null,
    observacion: observacion || null,
  });
};

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

// GET /api/ubicaciones/pendientes-ubicar
// Lista ítems de recepciones confirmadas sin ubicación asignada
const pendientesUbicar = async (req, res) => {
  const { data, error } = await supabase
    .from("inventario")
    .select(
      "id, producto_id, bodega_id, cantidad_disponible, ubicacion_id, productos(codigo_interno, descripcion_corta, unidad_empaque), bodegas(codigo, nombre)",
    )
    .is("ubicacion_id", null)
    .gt("cantidad_disponible", 0);

  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

// POST /api/ubicaciones/ubicar-caja
// El montacarguista escanea una ubicación y luego una caja para asignarla
// Body: { ubicacion_escaneada, caja_escaneada }
const ubicarCaja = async (req, res) => {
  const { ubicacion_escaneada, caja_escaneada } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (!ubicacion_escaneada || !caja_escaneada) {
    return res
      .status(400)
      .json({ error: "ubicacion_escaneada y caja_escaneada son requeridos" });
  }

  // 1. Buscar la ubicación
  const ubicacion = await buscarUbicacion(ubicacion_escaneada);
  if (!ubicacion) {
    return res
      .status(404)
      .json({ error: `Ubicación no encontrada: ${ubicacion_escaneada}` });
  }

  // 2. Buscar el producto
  const producto = await buscarProductoPorEscaneo(caja_escaneada);
  if (!producto) {
    return res
      .status(404)
      .json({ error: `Producto no encontrado: ${caja_escaneada}` });
  }

  const ue = producto.unidad_empaque || 1;

  // 3. Buscar inventario sin ubicación de este producto en la misma bodega
  const { data: invSinUbic } = await supabase
    .from("inventario")
    .select("id, cantidad_disponible, cantidad_comprometida")
    .eq("producto_id", producto.id)
    .eq("bodega_id", ubicacion.bodega_id)
    .is("ubicacion_id", null)
    .single();

  if (!invSinUbic || invSinUbic.cantidad_disponible < ue) {
    return res.status(400).json({
      error: `No hay stock sin ubicar de ${producto.codigo_interno} en esta bodega`,
    });
  }

  // 4. Buscar inventario existente en esa ubicación para el mismo producto
  const { data: invConUbic } = await supabase
    .from("inventario")
    .select("id, cantidad_disponible, cantidad_comprometida")
    .eq("producto_id", producto.id)
    .eq("bodega_id", ubicacion.bodega_id)
    .eq("ubicacion_id", ubicacion.id)
    .single();

  // 5. Actualizar inventario — descontar del sin-ubicación y sumar al con-ubicación
  if (invConUbic) {
    // Ya existe en esa ubicación — sumar
    await supabase
      .from("inventario")
      .update({ cantidad_disponible: invConUbic.cantidad_disponible + ue })
      .eq("id", invConUbic.id);
  } else {
    // Nueva fila para esta ubicación
    await supabase.from("inventario").insert({
      producto_id: producto.id,
      bodega_id: ubicacion.bodega_id,
      ubicacion_id: ubicacion.id,
      cantidad_disponible: ue,
      cantidad_comprometida: 0,
    });
  }

  // Descontar del inventario sin ubicación
  const nuevaCantSinUbic = invSinUbic.cantidad_disponible - ue;
  if (nuevaCantSinUbic <= 0) {
    await supabase.from("inventario").delete().eq("id", invSinUbic.id);
  } else {
    await supabase
      .from("inventario")
      .update({ cantidad_disponible: nuevaCantSinUbic })
      .eq("id", invSinUbic.id);
  }

  // 6. Registrar movimiento
  await registrarMovimiento({
    usuario_id,
    tipo: "ubicar",
    producto_id: producto.id,
    bodega_id: ubicacion.bodega_id,
    ubicacion_destino_id: ubicacion.id,
    cantidad_cajas: 1,
    cantidad_unidades: ue,
    observacion: `Ubicado en ${ubicacion.codigo}`,
  });

  return res.json({
    mensaje: `✓ ${producto.codigo_interno} ubicado en ${ubicacion.codigo}`,
    producto: {
      codigo_interno: producto.codigo_interno,
      descripcion: producto.descripcion_corta,
    },
    ubicacion: { codigo: ubicacion.codigo },
    unidades: ue,
  });
};

// POST /api/ubicaciones/mover-caja
// Mueve cajas de una ubicación a otra escaneando: origen → cajas → destino
// Body: { ubicacion_origen_escaneada, caja_escaneada, ubicacion_destino_escaneada }
const moverCaja = async (req, res) => {
  const {
    ubicacion_origen_escaneada,
    caja_escaneada,
    ubicacion_destino_escaneada,
  } = req.body || {};
  const usuario_id = req.usuario?.id;

  if (
    !ubicacion_origen_escaneada ||
    !caja_escaneada ||
    !ubicacion_destino_escaneada
  ) {
    return res
      .status(400)
      .json({
        error: "ubicacion_origen, caja y ubicacion_destino son requeridos",
      });
  }

  // 1. Buscar ubicaciones
  const origen = await buscarUbicacion(ubicacion_origen_escaneada);
  if (!origen)
    return res
      .status(404)
      .json({
        error: `Ubicación origen no encontrada: ${ubicacion_origen_escaneada}`,
      });

  const destino = await buscarUbicacion(ubicacion_destino_escaneada);
  if (!destino)
    return res
      .status(404)
      .json({
        error: `Ubicación destino no encontrada: ${ubicacion_destino_escaneada}`,
      });

  if (origen.id === destino.id)
    return res
      .status(400)
      .json({ error: "La ubicación origen y destino son la misma" });

  // 2. Buscar el producto
  const producto = await buscarProductoPorEscaneo(caja_escaneada);
  if (!producto)
    return res
      .status(404)
      .json({ error: `Producto no encontrado: ${caja_escaneada}` });

  const ue = producto.unidad_empaque || 1;

  // 3. Verificar stock en origen
  const { data: invOrigen } = await supabase
    .from("inventario")
    .select("id, cantidad_disponible, cantidad_comprometida")
    .eq("producto_id", producto.id)
    .eq("ubicacion_id", origen.id)
    .single();

  if (!invOrigen || invOrigen.cantidad_disponible < ue) {
    return res.status(400).json({
      error: `No hay suficiente stock de ${producto.codigo_interno} en ${origen.codigo}`,
    });
  }

  // 4. Actualizar inventario origen
  const nuevaCantOrigen = invOrigen.cantidad_disponible - ue;
  if (nuevaCantOrigen <= 0) {
    await supabase.from("inventario").delete().eq("id", invOrigen.id);
  } else {
    await supabase
      .from("inventario")
      .update({ cantidad_disponible: nuevaCantOrigen })
      .eq("id", invOrigen.id);
  }

  // 5. Actualizar inventario destino
  const { data: invDestino } = await supabase
    .from("inventario")
    .select("id, cantidad_disponible")
    .eq("producto_id", producto.id)
    .eq("ubicacion_id", destino.id)
    .single();

  if (invDestino) {
    await supabase
      .from("inventario")
      .update({ cantidad_disponible: invDestino.cantidad_disponible + ue })
      .eq("id", invDestino.id);
  } else {
    await supabase.from("inventario").insert({
      producto_id: producto.id,
      bodega_id: destino.bodega_id,
      ubicacion_id: destino.id,
      cantidad_disponible: ue,
      cantidad_comprometida: 0,
    });
  }

  // 6. Registrar movimiento
  await registrarMovimiento({
    usuario_id,
    tipo: "traslado_cajas",
    producto_id: producto.id,
    bodega_id: origen.bodega_id,
    ubicacion_origen_id: origen.id,
    ubicacion_destino_id: destino.id,
    cantidad_cajas: 1,
    cantidad_unidades: ue,
    observacion: `Movido de ${origen.codigo} a ${destino.codigo}`,
  });

  return res.json({
    mensaje: `✓ ${producto.codigo_interno} movido de ${origen.codigo} a ${destino.codigo}`,
    producto: {
      codigo_interno: producto.codigo_interno,
      descripcion: producto.descripcion_corta,
    },
    origen: { codigo: origen.codigo },
    destino: { codigo: destino.codigo },
    unidades: ue,
  });
};

// POST /api/ubicaciones/mover-ubicacion
// Mueve TODO el contenido de una ubicación a otra
// Body: { ubicacion_origen_escaneada, ubicacion_destino_escaneada }
const moverUbicacion = async (req, res) => {
  const { ubicacion_origen_escaneada, ubicacion_destino_escaneada } =
    req.body || {};
  const usuario_id = req.usuario?.id;

  if (!ubicacion_origen_escaneada || !ubicacion_destino_escaneada) {
    return res
      .status(400)
      .json({ error: "ubicacion_origen y ubicacion_destino son requeridos" });
  }

  const origen = await buscarUbicacion(ubicacion_origen_escaneada);
  if (!origen)
    return res.status(404).json({ error: `Ubicación origen no encontrada` });

  const destino = await buscarUbicacion(ubicacion_destino_escaneada);
  if (!destino)
    return res.status(404).json({ error: `Ubicación destino no encontrada` });

  if (origen.id === destino.id)
    return res
      .status(400)
      .json({ error: "La ubicación origen y destino son la misma" });

  // Obtener todo el inventario del origen
  const { data: itemsOrigen, error } = await supabase
    .from("inventario")
    .select("id, producto_id, cantidad_disponible, cantidad_comprometida")
    .eq("ubicacion_id", origen.id);

  if (error) return sendServerError(res, error, req);
  if (!itemsOrigen || itemsOrigen.length === 0) {
    return res
      .status(400)
      .json({ error: `La ubicación ${origen.codigo} está vacía` });
  }

  // Mover cada producto al destino
  for (const item of itemsOrigen) {
    const { data: invDestino } = await supabase
      .from("inventario")
      .select("id, cantidad_disponible, cantidad_comprometida")
      .eq("producto_id", item.producto_id)
      .eq("ubicacion_id", destino.id)
      .single();

    if (invDestino) {
      // Sumar al destino
      await supabase
        .from("inventario")
        .update({
          cantidad_disponible:
            invDestino.cantidad_disponible + item.cantidad_disponible,
          cantidad_comprometida:
            invDestino.cantidad_comprometida + item.cantidad_comprometida,
        })
        .eq("id", invDestino.id);
    } else {
      // Crear en destino
      await supabase.from("inventario").insert({
        producto_id: item.producto_id,
        bodega_id: destino.bodega_id,
        ubicacion_id: destino.id,
        cantidad_disponible: item.cantidad_disponible,
        cantidad_comprometida: item.cantidad_comprometida,
      });
    }

    // Registrar movimiento por cada producto
    await registrarMovimiento({
      usuario_id,
      tipo: "traslado_ubicacion",
      producto_id: item.producto_id,
      bodega_id: origen.bodega_id,
      ubicacion_origen_id: origen.id,
      ubicacion_destino_id: destino.id,
      cantidad_cajas: Math.ceil(item.cantidad_disponible / 1),
      cantidad_unidades: item.cantidad_disponible,
      observacion: `Traslado completo de ${origen.codigo} a ${destino.codigo}`,
    });
  }

  // Eliminar todos los ítems del origen
  await supabase.from("inventario").delete().eq("ubicacion_id", origen.id);

  return res.json({
    mensaje: `✓ Todo el contenido de ${origen.codigo} movido a ${destino.codigo}`,
    items_movidos: itemsOrigen.length,
    origen: { codigo: origen.codigo },
    destino: { codigo: destino.codigo },
  });
};

// GET /api/ubicaciones/movimientos
// Historial de movimientos con filtros
const listarMovimientos = async (req, res) => {
  const {
    producto_id,
    ubicacion_id,
    usuario_id: uid,
    tipo,
    limit = 50,
  } = req.query;

  let query = supabase
    .from("movimientos_ubicacion")
    .select(
      `
      id, tipo, cantidad_cajas, cantidad_unidades, observacion, created_at,
      usuarios(nombre),
      productos(codigo_interno, descripcion_corta),
      ubicacion_origen:ubicaciones!movimientos_ubicacion_ubicacion_origen_id_fkey(codigo),
      ubicacion_destino:ubicaciones!movimientos_ubicacion_ubicacion_destino_id_fkey(codigo)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (producto_id) query = query.eq("producto_id", producto_id);
  if (ubicacion_id)
    query = query.or(
      `ubicacion_origen_id.eq.${ubicacion_id},ubicacion_destino_id.eq.${ubicacion_id}`,
    );
  if (uid) query = query.eq("usuario_id", uid);
  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) return sendServerError(res, error, req);
  return res.json(data || []);
};

// GET /api/ubicaciones/resolver?escaneado=xxx
// Resuelve si un código escaneado es una ubicación o un producto
const resolverEscaneado = async (req, res) => {
  const { escaneado } = req.query;
  if (!escaneado)
    return res.status(400).json({ error: "escaneado es requerido" });

  if (esCodigoUbicacion(escaneado)) {
    const ubicacion = await buscarUbicacion(escaneado);
    if (ubicacion) return res.json({ tipo: "ubicacion", datos: ubicacion });
    return res.status(404).json({ error: "Ubicación no encontrada" });
  }

  const producto = await buscarProductoPorEscaneo(escaneado);
  if (producto) return res.json({ tipo: "producto", datos: producto });

  return res
    .status(404)
    .json({ error: "Código no reconocido como ubicación ni como producto" });
};

module.exports = {
  pendientesUbicar,
  ubicarCaja,
  moverCaja,
  moverUbicacion,
  listarMovimientos,
  resolverEscaneado,
};
