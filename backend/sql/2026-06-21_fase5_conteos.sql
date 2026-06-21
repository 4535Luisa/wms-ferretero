-- Fase 5 — Conteos cíclicos y mini-conteos. Aplicar en Supabase (SQL Editor).
--
-- El rol "inventarios" cuenta un producto en una bodega; el sistema calcula la
-- diferencia contra el inventario y, si la hay, se genera un AJUSTE que el
-- gerente aprueba (reusa el flujo de ajustes). Los mini-conteos también se
-- encolan automáticamente desde picking cuando el operario alista una cantidad
-- distinta a la pedida (quedan 'pendiente' para que inventarios los cuente).

-- Crea la tabla si no existe (con el esquema completo).
CREATE TABLE IF NOT EXISTS mini_conteos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  bodega_id uuid,
  ubicacion_id uuid,
  cantidad_sistema numeric,
  cantidad_contada numeric,
  diferencia numeric,
  estado text NOT NULL DEFAULT 'pendiente', -- pendiente|contado|ajustado|sin_diferencia
  origen text NOT NULL DEFAULT 'ciclico',   -- ciclico|picking
  contado_por uuid,
  ajuste_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  counted_at timestamptz
);

-- Si la tabla ya existía (con el subset del documento), agrega las columnas que
-- falten (no-op si ya están).
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS bodega_id uuid;
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente';
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'ciclico';
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS contado_por uuid;
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS ajuste_id uuid;
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE mini_conteos ADD COLUMN IF NOT EXISTS counted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mini_conteos_estado_created
  ON mini_conteos (estado, created_at DESC);
