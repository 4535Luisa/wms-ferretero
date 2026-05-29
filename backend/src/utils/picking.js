// Lógica compartida de picking para evitar duplicación entre controladores.

const ORDEN_BODEGAS = ["B8", "B36", "B7"];

// Dado lo pedido y la unidad de empaque, separa cajas completas y unidades
// sueltas. Regla de negocio §6.1: el resto del módulo siempre va a saldos.
const splitCajaSaldo = (cantidadPedida, unidadEmpaque) => {
  const ue = unidadEmpaque || 0;
  if (!ue || ue <= 1) {
    return { aplica: false, cajasCompletas: 0, unidadesSueltas: 0 };
  }
  return {
    aplica: true,
    cajasCompletas: Math.floor(cantidadPedida / ue),
    unidadesSueltas: cantidadPedida % ue,
  };
};

module.exports = { ORDEN_BODEGAS, splitCajaSaldo };
