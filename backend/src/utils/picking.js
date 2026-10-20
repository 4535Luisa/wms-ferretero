// Lógica compartida de picking para evitar duplicación entre controladores.

const ORDEN_BODEGAS = ["B8", "B36", "B7"];

// Dado lo pedido y la unidad de empaque, separa cajas completas y unidades
// sueltas. Regla de negocio §6.1: el resto del módulo siempre va a saldos.
//
// Si la unidad de empaque es desconocida (NULL/0) o no forma una caja real
// (<=1), NO se puede determinar una caja cerrada con certeza, así que TODA la
// cantidad se trata como unidades sueltas → SALDOS (formaCaja: false). Antes
// este caso devolvía aplica:false y los llamadores hacían `continue`, lo que
// OMITÍA por completo el producto del picking (bug: los pedidos de productos
// sin unidad_empaque desaparecían y nunca se alistaban).
const splitCajaSaldo = (cantidadPedida, unidadEmpaque) => {
  const cantidad = Number(cantidadPedida) || 0;
  const ue = Number(unidadEmpaque) || 0;
  if (ue <= 1) {
    return { formaCaja: false, cajasCompletas: 0, unidadesSueltas: cantidad };
  }
  return {
    formaCaja: true,
    cajasCompletas: Math.floor(cantidad / ue),
    unidadesSueltas: cantidad % ue,
  };
};

// Expande cada línea de picking en 1 registro por caja física. Cada caja lleva
// SOLO sus unidades (total de la línea / cajas): bajar_caja descuenta
// cantidad_unidades por cada registro, así que copiar el total de la línea en
// cada caja multiplicaba el descuento de inventario por el número de cajas.
const expandirCajas = (items, listaId) => {
  const expandidos = [];
  for (const item of items) {
    const numCajas = item.cantidad_cajas || 1;
    const unidadesPorCaja = item.cantidad_unidades / numCajas;
    for (let c = 0; c < numCajas; c++) {
      expandidos.push({
        lista_id: listaId,
        pedido_id: item.pedido_id,
        producto_id: item.producto_id,
        ubicacion_id: item.ubicacion_id,
        ubicacion_codigo: item.ubicacion_codigo,
        referencia: item.referencia,
        descripcion: item.descripcion,
        cantidad_cajas: 1,
        cantidad_unidades: unidadesPorCaja,
        destino_saldos: item.destino_saldos,
        wave_id: item.wave_id,
        estado: "pendiente",
      });
    }
  }
  return expandidos;
};

module.exports = { ORDEN_BODEGAS, splitCajaSaldo, expandirCajas };
