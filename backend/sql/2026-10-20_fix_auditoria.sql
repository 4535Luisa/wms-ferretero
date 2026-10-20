-- Correcciones de la auditoría 2026-10-20.
--
-- Ejecutar en Supabase → SQL Editor, POR SECCIONES y en orden. Las secciones
-- 1 y 2 son seguras de re-ejecutar. La sección 3 modifica datos: primero
-- corre la VISTA PREVIA (3a), revisa el resultado y solo después el UPDATE (3b).
--
-- Tras aplicar: notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) liberar_inventario_picking: inverso de reservar_inventario_picking.
--    Lo usa el backend cuando reservó stock para una lista de picking que
--    luego no se pudo crear (antes ese stock quedaba comprometido para siempre).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function liberar_inventario_picking(
  p_inventario_id uuid,
  p_unidades numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_inv inventario%rowtype;
begin
  if p_unidades is null or p_unidades <= 0 then
    return jsonb_build_object('status', 'ok', 'liberado', 0);
  end if;

  select * into v_inv from inventario where id = p_inventario_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update inventario
     set cantidad_comprometida = greatest(0, coalesce(cantidad_comprometida, 0) - p_unidades)
   where id = v_inv.id;

  return jsonb_build_object('status', 'ok', 'liberado', p_unidades);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Permisos de ejecución de las RPC.
--    Postgres concede EXECUTE a PUBLIC por defecto al crear una función, y el
--    `grant ... to service_role` de los SQL anteriores no lo quitaba: las
--    funciones podían llamarse con la anon key (pública, va en el frontend).
--    El backend usa la service key, así que solo service_role necesita
--    ejecutarlas. Se aplica a todas las sobrecargas de cada nombre; las que
--    no existan en tu base se ignoran.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'entregar_saldo',
        'confirmar_caja_saldos',
        'bajar_caja',
        'confirmar_recepcion',
        'confirmar_recepcion_directo',
        'cancelar_lista_picking',
        'reservar_inventario_picking',
        'liberar_inventario_picking',
        'registrar_devolucion',
        'ensamblar_kit',
        'desensamblar_kit',
        'aplicar_ajuste_inventario',
        'crear_traslado',
        'confirmar_traslado',
        'cancelar_traslado'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
    raise notice 'permisos ajustados: %', f.firma;
  end loop;
end;
$$;

-- Verificación: ninguna fila debe mostrar anon ni authenticated.
-- select p.proname, r.rolname
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
-- where n.nspname = 'public'
--   and p.proname in ('bajar_caja', 'entregar_saldo', 'reservar_inventario_picking')
--   and has_function_privilege(r.rolname, p.oid, 'execute');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Cajas de picking PENDIENTES guardadas con las unidades de toda la línea.
--    Bug: al dividir una línea de N cajas en N registros, cada registro llevaba
--    el total de la línea (N × unidad_empaque) en vez de una caja. Al bajar
--    cada caja se descontaba el total N veces.
--
--    Criterio conservador: un grupo (misma lista, pedido, producto, ubicación
--    y cantidad_unidades) con N > 1 registros cuya cantidad_unidades es
--    exactamente N × unidad_empaque actual. Si la unidad de empaque cambió o
--    el grupo es ambiguo, NO se toca. Solo se corrigen los registros en
--    estado 'pendiente'; lo ya bajado afectó el inventario físico y se
--    resuelve con un conteo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 3a) VISTA PREVIA (no modifica nada)
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

-- 3b) CORRECCIÓN — ejecutar solo tras revisar 3a. Devuelve las filas cambiadas.
-- begin;
-- with grupos as (
--   select
--     i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades,
--     count(*) as n_cajas
--   from lista_picking_items i
--   where coalesce(i.destino_saldos, false) = false
--     and i.cantidad_cajas = 1
--   group by i.lista_id, i.pedido_id, i.producto_id, i.ubicacion_id, i.cantidad_unidades
--   having count(*) > 1
-- ),
-- objetivo as (
--   select i.id, p.unidad_empaque
--   from lista_picking_items i
--   join grupos g
--     on g.lista_id = i.lista_id
--    and g.pedido_id is not distinct from i.pedido_id
--    and g.producto_id = i.producto_id
--    and g.ubicacion_id is not distinct from i.ubicacion_id
--    and g.cantidad_unidades = i.cantidad_unidades
--   join productos p on p.id = i.producto_id
--   where i.estado = 'pendiente'
--     and p.unidad_empaque > 1
--     and i.cantidad_unidades = g.n_cajas * p.unidad_empaque
-- )
-- update lista_picking_items i
--    set cantidad_unidades = o.unidad_empaque
--   from objetivo o
--  where i.id = o.id
-- returning i.id, i.referencia, i.cantidad_unidades;
-- commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) DIAGNÓSTICO (solo lectura): stock comprometido vs. cajas pendientes.
--    Las bajadas con el bug liberaron de más lo comprometido. Esta consulta
--    compara, por producto+ubicación, lo comprometido en inventario con lo
--    que suman las cajas pendientes (ejecutar DESPUÉS de 3b). Las diferencias
--    son candidatas a revisión/conteo; no se corrigen automáticamente porque
--    otros flujos también pueden comprometer stock.
-- ═══════════════════════════════════════════════════════════════════════════
-- with pend as (
--   select producto_id, ubicacion_id, sum(cantidad_unidades) as unidades_pendientes
--   from lista_picking_items
--   where estado = 'pendiente' and ubicacion_id is not null
--   group by producto_id, ubicacion_id
-- ),
-- comp as (
--   select producto_id, ubicacion_id, sum(coalesce(cantidad_comprometida, 0)) as comprometido
--   from inventario
--   where ubicacion_id is not null
--   group by producto_id, ubicacion_id
-- )
-- select
--   coalesce(c.producto_id, p.producto_id) as producto_id,
--   coalesce(c.ubicacion_id, p.ubicacion_id) as ubicacion_id,
--   coalesce(c.comprometido, 0) as comprometido_en_inventario,
--   coalesce(p.unidades_pendientes, 0) as unidades_en_cajas_pendientes
-- from comp c
-- full join pend p using (producto_id, ubicacion_id)
-- where coalesce(c.comprometido, 0) <> coalesce(p.unidades_pendientes, 0)
-- order by 1, 2;
