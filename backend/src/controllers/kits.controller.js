const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isUuid, toFiniteNumber } = require("../utils/validate");

// Lista los kits definidos con sus componentes y los nombres de producto.
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
  const { data: prods } = await supabase
    .from("productos")
    .select("id, codigo_interno, descripcion_corta")
    .in("id", ids);
  const pmap = Object.fromEntries((prods || []).map((p) => [p.id, p]));

  const kits = {};
  for (const c of comps) {
    if (!kits[c.kit_producto_id]) {
      kits[c.kit_producto_id] = {
        kit_producto_id: c.kit_producto_id,
        kit: pmap[c.kit_producto_id] || null,
        componentes: [],
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

module.exports = { listarKits, definirKit, ensamblar, desensamblar };
