const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

// Lista los kits definidos con sus componentes, los nombres de producto y, si es
// preensamblado, su stock listo / mínimo y el faltante a reponer.
const listarKits = async (req, res) => {
  const { data: comps, error } = await supabase
    .from("kit_componentes")
    .select("*");
  if (error) return sendServerError(res, error, req);
  if (!comps || comps.length === 0) return res.json([]);

  // Nombres de todos los productos involucrados (kits y componentes).
  const ids = [
    ...new Set(
      comps.flatMap((c) => [c.kit_producto_id, c.componente_producto_id]),
    ),
  ];
  const kitIds = [...new Set(comps.map((c) => c.kit_producto_id))];

  const [{ data: prods }, { data: configs }, { data: inv }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", ids),
    supabase
      .from("kits_config")
      .select("kit_producto_id, preensamblado, min_listas, bodega_id")
      .in("kit_producto_id", kitIds),
    supabase
      .from("inventario")
      .select("producto_id, bodega_id, cantidad_disponible")
      .in("producto_id", kitIds),
  ]);
  const pmap = Object.fromEntries((prods || []).map((p) => [p.id, p]));
  const cfgMap = Object.fromEntries(
    (configs || []).map((c) => [c.kit_producto_id, c]),
  );

  // Stock listo del kit: disponible en la bodega designada (o total si no hay).
  const stockListo = (kitId, bodegaId) =>
    (inv || [])
      .filter(
        (r) =>
          r.producto_id === kitId && (!bodegaId || r.bodega_id === bodegaId),
      )
      .reduce((a, r) => a + (r.cantidad_disponible || 0), 0);

  const kits = {};
  for (const c of comps) {
    if (!kits[c.kit_producto_id]) {
      const cfg = cfgMap[c.kit_producto_id] || {};
      const listo = stockListo(c.kit_producto_id, cfg.bodega_id);
      kits[c.kit_producto_id] = {
        kit_producto_id: c.kit_producto_id,
        kit: pmap[c.kit_producto_id] || null,
        componentes: [],
        preensamblado: !!cfg.preensamblado,
        min_listas: cfg.min_listas || 0,
        bodega_preensamble: cfg.bodega_id || null,
        stock_listo: listo,
        deficit:
          cfg.preensamblado && cfg.min_listas
            ? Math.max(0, cfg.min_listas - listo)
            : 0,
      };
    }
    kits[c.kit_producto_id].componentes.push({
      id: c.id,
      componente_producto_id: c.componente_producto_id,
      producto: pmap[c.componente_producto_id] || null,
      cantidad: c.cantidad,
    });
  }
  return res.json(Object.values(kits));
};

// Configura un kit como preensamblado: mínimo de unidades listas y bodega donde
// se mantiene ese stock. Upsert por kit_producto_id.
const configurarPreensamble = async (req, res) => {
  const { kitId } = req.params;
  const { preensamblado, min_listas, bodega_id } = req.body || {};
  if (!isUuid(kitId)) return res.status(400).json({ error: "Kit inválido" });

  const min = toFiniteNumber(min_listas);
  if (min === null || min < 0)
    return res
      .status(400)
      .json({ error: "El mínimo de unidades listas no puede ser negativo" });
  if (bodega_id != null && bodega_id !== "" && !isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });

  const fila = {
    kit_producto_id: kitId,
    preensamblado: !!preensamblado,
    min_listas: min,
    bodega_id: bodega_id || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("kits_config")
    .upsert(fila, { onConflict: "kit_producto_id" });
  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id: req.usuario?.id || null,
    accion: "CONFIG_PREENSAMBLE_KIT",
    tabla: "kits_config",
    registro_id: kitId,
    valores_despues: fila,
  });

  return res.json({ mensaje: "Configuración de preensamble guardada" });
};

// Núcleo reutilizable (controlador HTTP y script de cron). Lanza en error.
const alertarPreensambleCore = async () => {
  const { data: configs, error } = await supabase
    .from("kits_config")
    .select("kit_producto_id, min_listas, bodega_id")
    .eq("preensamblado", true)
    .gt("min_listas", 0);
  if (error) throw error;
  if (!configs || configs.length === 0)
    return { generadas: 0, mensaje: "No hay kits preensamblados" };

  const kitIds = configs.map((c) => c.kit_producto_id);
  const [{ data: inv }, { data: prods }, { data: dest }] = await Promise.all([
    supabase
      .from("inventario")
      .select("producto_id, bodega_id, cantidad_disponible")
      .in("producto_id", kitIds),
    supabase
      .from("productos")
      .select("id, codigo_interno, descripcion_corta")
      .in("id", kitIds),
    supabase
      .from("usuarios")
      .select("id")
      .in("rol", ["inventarios", "gerente_logistico"])
      .eq("activo", true),
  ]);
  const destinatarios = (dest || []).map((u) => u.id);
  if (destinatarios.length === 0)
    return {
      generadas: 0,
      mensaje: "No hay destinatarios activos (inventarios / gerente_logistico)",
    };
  const pInfo = Object.fromEntries((prods || []).map((p) => [p.id, p]));

  // Dedup: alertas de preensamble ya creadas hoy.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const { data: existentes } = await supabase
    .from("notificaciones")
    .select("datos")
    .eq("tipo", "alerta_preensamble")
    .gte("created_at", hoy.toISOString());
  const yaAlertado = new Set(
    (existentes || []).map((n) => n.datos?.producto_id),
  );

  const inserts = [];
  let kitsEnFalta = 0;
  for (const cfg of configs) {
    const listo = (inv || [])
      .filter(
        (r) =>
          r.producto_id === cfg.kit_producto_id &&
          (!cfg.bodega_id || r.bodega_id === cfg.bodega_id),
      )
      .reduce((a, r) => a + (r.cantidad_disponible || 0), 0);
    if (listo >= cfg.min_listas) continue;
    if (yaAlertado.has(cfg.kit_producto_id)) continue;
    kitsEnFalta++;
    const faltan = cfg.min_listas - listo;
    const p = pInfo[cfg.kit_producto_id];
    for (const uid of destinatarios)
      inserts.push({
        usuario_id: uid,
        tipo: "alerta_preensamble",
        titulo: "Kit por reponer",
        mensaje: `${p?.codigo_interno || cfg.kit_producto_id} (${p?.descripcion_corta || "—"}): ${listo} listo(s) de ${cfg.min_listas} — ensamblar ${faltan}`,
        datos: {
          producto_id: cfg.kit_producto_id,
          listo,
          min_listas: cfg.min_listas,
          faltan,
        },
      });
  }

  for (let i = 0; i < inserts.length; i += 500)
    await supabase.from("notificaciones").insert(inserts.slice(i, i + 500));

  return {
    generadas: inserts.length,
    kits_en_falta: kitsEnFalta,
    destinatarios: destinatarios.length,
  };
};

// Alertas de preensamble: notifica a inventarios y gerencia los kits
// preensamblados cuyo stock listo cayó por debajo del mínimo. Deduplicado por día
// (no repite el mismo kit el mismo día). Invocable a mano o agendable (cron).
const alertarPreensamble = async (req, res) => {
  try {
    return res.json(await alertarPreensambleCore());
  } catch (error) {
    return sendServerError(res, error, req);
  }
};

// Define (o redefine) la receta de un kit: reemplaza sus componentes.
const definirKit = async (req, res) => {
  const { kit_producto_id, componentes } = req.body || {};

  if (!isUuid(kit_producto_id))
    return res.status(400).json({ error: "Kit inválido" });
  if (!Array.isArray(componentes) || componentes.length === 0)
    return res.status(400).json({ error: "El kit necesita al menos un componente" });

  const filas = [];
  for (const c of componentes) {
    if (!isUuid(c?.producto_id))
      return res.status(400).json({ error: "Componente inválido" });
    if (c.producto_id === kit_producto_id)
      return res
        .status(400)
        .json({ error: "Un kit no puede contenerse a sí mismo" });
    const cant = toFiniteNumber(c.cantidad);
    if (cant === null || cant <= 0)
      return res
        .status(400)
        .json({ error: "Cada componente requiere una cantidad mayor a 0" });
    filas.push({
      kit_producto_id,
      componente_producto_id: c.producto_id,
      cantidad: cant,
    });
  }

  // Reemplaza la receta anterior.
  await supabase
    .from("kit_componentes")
    .delete()
    .eq("kit_producto_id", kit_producto_id);
  const { error } = await supabase.from("kit_componentes").insert(filas);
  if (error) return sendServerError(res, error, req);

  await supabase.from("bitacora").insert({
    usuario_id: req.usuario?.id || null,
    accion: "DEFINIR_KIT",
    tabla: "kit_componentes",
    registro_id: kit_producto_id,
    valores_despues: { componentes: filas.length },
  });

  return res.json({ mensaje: "Kit definido", componentes: filas.length });
};

// Resuelve el resultado común de las RPC de ensamble/desensamble.
const resolverRpc = (res, r) => {
  switch (r.status) {
    case "invalid":
      return res.status(400).json({ error: "Cantidad inválida" });
    case "no_recipe":
      return res
        .status(400)
        .json({ error: "El kit no tiene receta definida" });
    case "insufficient":
      return res.status(400).json({
        error: r.componente
          ? `Falta componente (disponible ${r.disponible}, requerido ${r.requerido})`
          : `Stock de kit insuficiente (disponible ${r.disponible})`,
      });
    case "ok":
      return null;
    default:
      return res.status(500).json({ error: "Error procesando la solicitud" });
  }
};

const ensamblar = async (req, res) => {
  const { kitId } = req.params;
  const { bodega_id, cantidad } = req.body || {};
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });
  const cant = toFiniteNumber(cantidad);
  if (cant === null || cant <= 0)
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });

  const { data, error } = await supabase.rpc("ensamblar_kit", {
    p_kit_producto_id: kitId,
    p_bodega_id: bodega_id,
    p_cantidad: cant,
    p_usuario_id: req.usuario?.id || null,
  });
  if (error) return sendServerError(res, error, req);
  const fin = resolverRpc(res, data || {});
  if (fin) return fin;
  return res.json({ mensaje: `${cant} kit(s) ensamblado(s)` });
};

const desensamblar = async (req, res) => {
  const { kitId } = req.params;
  const { bodega_id, cantidad } = req.body || {};
  if (!isUuid(bodega_id))
    return res.status(400).json({ error: "Bodega inválida" });
  const cant = toFiniteNumber(cantidad);
  if (cant === null || cant <= 0)
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });

  const { data, error } = await supabase.rpc("desensamblar_kit", {
    p_kit_producto_id: kitId,
    p_bodega_id: bodega_id,
    p_cantidad: cant,
    p_usuario_id: req.usuario?.id || null,
  });
  if (error) return sendServerError(res, error, req);
  const fin = resolverRpc(res, data || {});
  if (fin) return fin;
  return res.json({ mensaje: `${cant} kit(s) desensamblado(s)` });
};

module.exports = {
  listarKits,
  definirKit,
  ensamblar,
  desensamblar,
  configurarPreensamble,
  alertarPreensamble,
  alertarPreensambleCore,
};
