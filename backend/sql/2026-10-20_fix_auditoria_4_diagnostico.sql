-- 4) DIAGNÓSTICO — solo lectura, no modifica nada. Ejecutar DESPUÉS del 3b.
-- Pegar ESTE ARCHIVO COMPLETO en el SQL Editor de Supabase y ejecutar.
--
-- Las bajadas hechas con el bug liberaron de más el stock comprometido. Esta
-- consulta compara, por producto + ubicación, lo comprometido en inventario
-- con lo que suman las cajas de picking pendientes. Cada fila es una
-- diferencia candidata a revisión/conteo; no se corrige automáticamente
-- porque otros flujos también pueden comprometer stock.

with pend as (
  select producto_id, ubicacion_id, sum(cantidad_unidades) as unidades_pendientes
  from lista_picking_items
  where estado = 'pendiente' and ubicacion_id is not null
  group by producto_id, ubicacion_id
),
comp as (
  select producto_id, ubicacion_id, sum(coalesce(cantidad_comprometida, 0)) as comprometido
  from inventario
  where ubicacion_id is not null
  group by producto_id, ubicacion_id
)
select
  coalesce(c.producto_id, p.producto_id) as producto_id,
  coalesce(c.ubicacion_id, p.ubicacion_id) as ubicacion_id,
  coalesce(c.comprometido, 0) as comprometido_en_inventario,
  coalesce(p.unidades_pendientes, 0) as unidades_en_cajas_pendientes
from comp c
full join pend p using (producto_id, ubicacion_id)
where coalesce(c.comprometido, 0) <> coalesce(p.unidades_pendientes, 0)
order by 1, 2;
