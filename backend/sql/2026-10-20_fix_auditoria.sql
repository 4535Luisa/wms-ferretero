-- Correcciones de la auditoría 2026-10-20.
--
-- Ejecutar en Supabase → SQL Editor DESPUÉS de desplegar el backend. Este
-- archivo (secciones 1 y 2) se puede pegar completo y es seguro re-ejecutarlo.
-- Las secciones 3 y 4 están en archivos aparte, cada uno para pegar completo:
--   2026-10-20_fix_auditoria_3a_vista_previa.sql  (solo lectura)
--   2026-10-20_fix_auditoria_3b_correccion.sql    (MODIFICA datos; tras el 3a)
--   2026-10-20_fix_auditoria_4_diagnostico.sql    (solo lectura; tras el 3b)
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
