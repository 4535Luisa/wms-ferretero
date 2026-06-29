-- Fase 5 — Familia de producto para conteos cíclicos programados. Aplicar en
-- Supabase (SQL Editor).
--
-- Agrega una columna de familia/categoría al catálogo para poder programar
-- conteos cíclicos agrupados por familia. El dato se carga aparte (archivo
-- MAESTRA); mientras esté vacío, simplemente no habrá familias para programar.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS familia text;

CREATE INDEX IF NOT EXISTS idx_productos_familia
  ON productos (familia) WHERE familia IS NOT NULL;

-- Si la columna nueva no aparece para PostgREST:
-- notify pgrst, 'reload schema';
