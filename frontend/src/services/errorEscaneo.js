import api from "./api";

// Registra en el servidor un escaneo que la pantalla rechazó antes de enviarlo
// (código no reconocido, caja que no es del pedido…). Guarda lo que leyó el
// dispositivo tal cual, para poder diagnosticar lectores mal configurados.
// Nunca interrumpe el escaneo: si falla, se ignora.
export function reportarErrorEscaneo({ codigo, modulo, pedido_id, pedido_item_id, esperado }) {
  if (!codigo) return;
  api
    .post("/api/alertas/errores-escaneo", {
      codigo_escaneado: String(codigo).slice(0, 200),
      codigo_esperado: esperado || null,
      modulo,
      pedido_id: pedido_id || null,
      pedido_item_id: pedido_item_id || null,
    })
    .catch(() => {});
}
