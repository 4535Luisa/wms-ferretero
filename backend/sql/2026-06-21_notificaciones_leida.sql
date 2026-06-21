-- Normaliza la columna `leida` de notificaciones para el centro de
-- notificaciones in-app (campana). Aplicar en Supabase (SQL Editor).
--
-- Contexto: los INSERT de notificaciones nunca seteaban `leida`, así que las
-- filas previas pueden tener NULL. Esto las deja en FALSE y garantiza el
-- DEFAULT para las nuevas, de modo que el conteo de "no leídas" sea exacto.

-- 1) Asegura la columna (no-op si ya existe).
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS leida boolean;

-- 2) Backfill: las que estaban en NULL pasan a FALSE (no leídas).
UPDATE notificaciones SET leida = false WHERE leida IS NULL;

-- 3) Default + NOT NULL para las futuras.
ALTER TABLE notificaciones
  ALTER COLUMN leida SET DEFAULT false;
ALTER TABLE notificaciones
  ALTER COLUMN leida SET NOT NULL;

-- 4) Índice para el polling de la campana: notificaciones de un usuario
--    ordenadas por fecha. Acelera GET /api/notificaciones.
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_created
  ON notificaciones (usuario_id, created_at DESC);
