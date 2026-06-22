-- Fase 4 — Verificación de pedidos. Aplicar en Supabase (SQL Editor).
--
-- Flujo nuevo del pedido:
--   cerrado (operario) -> verificado (jefe de bodega, con escaneo) -> despachado (facturación)
--
-- El jefe de bodega escanea cada caja para confirmar las referencias antes de
-- facturar. NO se toca inventario en este paso (ya se descontó en el picking).

-- 1) Estado de verificación por ítem (lo marca el escaneo del jefe).
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS verificado boolean NOT NULL DEFAULT false;

-- 2) Metadatos de verificación en el pedido.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS hora_verificacion timestamptz;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS verificado_por uuid;

-- 3) IMPORTANTE: el estado del pedido ahora puede valer 'verificado'.
--    Si la columna pedidos.estado tiene una restricción CHECK que enumera los
--    estados permitidos, hay que incluir 'verificado' o la transición fallará.
--    Descomenta y ajusta el nombre real de la constraint si existe:
--
--    ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
--    ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
--      CHECK (estado IN (
--        'pendiente','asignado','en_proceso','en_picking',
--        'cerrado','verificado','despachado'
--      ));
--
--    Si pedidos.estado es texto libre (sin CHECK), no hace falta nada aquí.

-- 4) Índice para la cola de verificación (pedidos cerrados por fecha de cierre).
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_hora_cierre
  ON pedidos (estado, hora_cierre);
