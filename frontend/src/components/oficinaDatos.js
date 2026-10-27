import { COLOR } from "./panel/formato";

// Constantes y utilidades de las pantallas de oficina (ver oficina.jsx).
export { COLOR };

export const estiloCampo = {
  font: "inherit",
  fontSize: "14px",
  padding: "8px 12px",
  minHeight: "42px",
  width: "100%",
  border: "1px solid #C9CDD4",
  borderRadius: "8px",
  background: "#FFFFFF",
  color: COLOR.negro,
  boxSizing: "border-box",
  outline: "none",
};

// Nombres de las acciones de la bitácora de inventario.
export const MOVIMIENTO = {
  RECEPCION_CONFIRMADA: { label: "Recepción", color: "#007A40", bg: "#E3F7EC" },
  RECEPCION_SALDOS: { label: "Entra a saldos", color: "#007A40", bg: "#E3F7EC" },
  PICKING: { label: "Picking", color: "#1E40AF", bg: "#DBEAFE" },
  CANCELACION_PICKING: { label: "Picking cancelado", color: "#3A3F4B", bg: "#EEF0F2" },
  AJUSTE: { label: "Ajuste", color: "#8A5A00", bg: "#FFF4D6" },
  AJUSTE_INVENTARIO: { label: "Ajuste", color: "#8A5A00", bg: "#FFF4D6" },
  ENTREGA_SALDOS: { label: "Entrega de saldos", color: "#5B21B6", bg: "#EDE9FE" },
  TRASLADO: { label: "Traslado", color: "#5B21B6", bg: "#EDE9FE" },
  DESPACHO: { label: "Despacho", color: "#B91C1C", bg: "#FDECEC" },
  CARGA_INVENTARIO: { label: "Carga de Excel", color: "#0369A1", bg: "#E0F2FE" },
};
export const movimiento = (accion) =>
  MOVIMIENTO[accion] || { label: accion, color: "#3A3F4B", bg: "#EEF0F2" };

// Cantidad antes/después de un movimiento: disponible o, si no hay, comprometida.
export function cantidadesMovimiento(mov) {
  for (const campo of ["cantidad_disponible", "cantidad_comprometida"]) {
    const a = mov.valores_antes?.[campo];
    const d = mov.valores_despues?.[campo];
    if (a !== undefined || d !== undefined)
      return { antes: a, despues: d, comprometida: campo === "cantidad_comprometida" };
  }
  return { antes: undefined, despues: undefined, comprometida: false };
}
