-- Fase 4 — Despacho de pedidos. Aplicar en Supabase (SQL Editor).
--
-- Flujo completo del pedido:
--   cerrado -> verificado -> despachado (jefe: bultos/peso/parcial) -> facturado
--
-- El jefe de bodega registra la salida física: número de bultos, peso y, si es
-- un despacho parcial, qué referencias quedan pendientes y por qué. NO se toca
-- inventario aquí (ya se descontó en el picking).

-- 1) Metadatos de despacho en el pedido.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS bultos integer;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS peso_kg numeric;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS despacho_parcial boolean NOT NULL DEFAULT false;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS observaciones_despacho text;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS hora_despacho timestamptz;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS despachado_por uuid;

-- 2) Ítems que quedan pendientes en un despacho parcial (con su motivo).
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS pendiente_despacho boolean NOT NULL DEFAULT false;
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS motivo_pendiente text;
