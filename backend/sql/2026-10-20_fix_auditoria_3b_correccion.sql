-- 3b) CORRECCIÓN — MODIFICA DATOS. Ejecutar solo después de revisar el 3a.
-- Pegar ESTE ARCHIVO COMPLETO en el SQL Editor de Supabase y ejecutar.
--
-- Usa exactamente el mismo criterio que el 3a y pone cantidad_unidades =
-- unidad_empaque (una caja) en esas filas. Es una sola sentencia, así que se
-- aplica completa o no se aplica. Devuelve las filas cambiadas: deben ser las
-- mismas que mostró el 3a. Re-ejecutarlo no cambia nada más (las filas ya
-- corregidas dejan de cumplir el criterio).

with grupos as (
  select
    i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades,
    count(*) as n_cajas
  from lista_picking_items i
  where coalesce(i.destino_saldos, false) = false
    and i.cantidad_cajas = 1
  group by i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades
  having count(*) > 1
),
objetivo as (
  select i.id, p.unidad_empaque
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
)
update lista_picking_items i
   set cantidad_unidades = o.unidad_empaque
  from objetivo o
 where i.id = o.id
returning i.id, i.referencia, i.cantidad_unidades;
