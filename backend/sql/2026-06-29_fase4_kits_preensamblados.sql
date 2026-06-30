-- Fase 4 — Kits preensamblados. Aplicar en Supabase (SQL Editor).
--
-- Un kit "preensamblado" se mantiene con stock ya ensamblado listo para vender.
-- Esta config marca el kit como preensamblado, fija un mínimo de unidades listas
-- (min_listas) y la bodega donde se mantiene ese stock. Cuando el disponible del
-- kit en esa bodega cae por debajo del mínimo, el sistema avisa para reponer
-- (ensamblar el faltante). No toca inventario; es solo configuración.

CREATE TABLE IF NOT EXISTS kits_config (
  kit_producto_id uuid PRIMARY KEY,
  preensamblado boolean NOT NULL DEFAULT false,
  min_listas numeric NOT NULL DEFAULT 0 CHECK (min_listas >= 0),
  bodega_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Si una columna/tabla nueva no aparece para PostgREST:
-- notify pgrst, 'reload schema';
