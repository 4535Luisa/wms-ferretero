-- Fase 4 — Datos del transportista en el despacho. Aplicar en Supabase.
--
-- Al registrar la salida física del pedido, el jefe de bodega también captura
-- los datos del transporte: empresa transportadora, número de guía/remesa,
-- nombre del conductor y placa del vehículo. Todos opcionales (no bloquean el
-- despacho). No tocan inventario; son metadatos de trazabilidad de la entrega.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS transportadora text;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS guia_transporte text;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS conductor text;
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS placa_vehiculo text;

-- Si una RPC/cache de PostgREST no refleja las columnas nuevas:
-- notify pgrst, 'reload schema';
