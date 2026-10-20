-- 3a) VISTA PREVIA — solo lectura, no modifica nada.
-- Pegar ESTE ARCHIVO COMPLETO en el SQL Editor de Supabase y ejecutar.
--
-- Lista las cajas de picking PENDIENTES guardadas con las unidades de toda la
-- línea (N × unidad_empaque) en vez de una caja. Criterio conservador: un
-- grupo (misma lista, pedido, producto, ubicación y cantidad_unidades) con
-- N > 1 registros cuya cantidad_unidades es exactamente N × unidad_empaque
-- actual. Si la unidad de empaque cambió o el grupo es ambiguo, no aparece.
--
-- Si devuelve 0 filas, no hay nada que corregir: NO ejecutes el 3b.

with grupos as (
  select
    i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades,
    count(*) as n_cajas
  from lista_picking_items i
  where coalesce(i.destino_saldos, false) = false
    and i.cantidad_cajas = 1
  group by i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades
  having count(*) > 1
)
select
  i.id, i.lista_id, i.referencia, i.estado,
  i.cantidad_unidades as unidades_actuales,
  p.unidad_empaque as unidades_correctas,
  g.n_cajas
from lista_picking_items i
join grupos g
  on g.lista_id = i.lista_id
 and g.pedido_id is not distinct from i.pedido_id
 and g.producto_id = i.producto_id
 and g.ubicacion_id is not distinct from i.ubicacion_id
 and g.cantidad_unidades = i.cantidad_unidades
join productos p on p.id = i.producto_id
where i.estado = 'pendiente'
  and p.unidad_empaque > 1
  and i.cantidad_unidades = g.n_cajas * p.unidad_empaque
order by i.lista_id, i.referencia;
