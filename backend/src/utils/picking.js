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

module.exports = { ORDEN_BODEGAS, splitCajaSaldo };
