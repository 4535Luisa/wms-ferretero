-- Fase 5 / T1: cancelar una lista de picking liberando el inventario
-- comprometido de sus ítems pendientes.
--
-- Contexto: generarListasPicking reserva `cantidad_comprometida` para cada
-- ítem (estado 'pendiente'); bajar_caja lo libera al bajar físicamente. Si una
-- lista se abandona, ese comprometido queda "colgado". Esta función cancela la
-- lista, marca sus ítems pendientes como 'cancelada' y devuelve el comprometido
-- al inventario, todo en UNA transacción con bloqueo (idempotente).
--
-- Tras aplicar, si la RPC no aparece: notify pgrst, 'reload schema';

create or replace function cancelar_lista_picking(p_lista_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_lista listas_picking%rowtype;
  v_item  lista_picking_items%rowtype;
  v_inv   inventario%rowtype;
  v_antes numeric;
  v_nuevo numeric;
  v_count integer := 0;
begin
  select * into v_lista from listas_picking where id = p_lista_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_lista.estado = 'cancelada' then
    return jsonb_build_object('status', 'already_done');
  end if;

  -- Solo los ítems aún pendientes mantienen comprometido (los bajados ya lo
  -- liberaron). Bloquea cada ítem para no chocar con un bajar_caja concurrente.
  for v_item in
    select * from lista_picking_items
    where lista_id = p_lista_id and estado = 'pendiente'
    for update
  loop
    if v_item.ubicacion_id is not null then
      select * into v_inv
      from inventario
      where producto_id = v_item.producto_id
        and ubicacion_id = v_item.ubicacion_id
      order by created_at asc
      limit 1
      for update;

      if v_inv.id is not null then
        v_antes := coalesce(v_inv.cantidad_comprometida, 0);
        v_nuevo := greatest(0, v_antes - coalesce(v_item.cantidad_unidades, 0));

        update inventario
           set cantidad_comprometida = v_nuevo, updated_at = now()
         where id = v_inv.id;

        insert into bitacora
          (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
        values (
          p_usuario_id, 'CANCELACION_PICKING', 'inventario', v_item.producto_id,
          jsonb_build_object('cantidad_comprometida', v_antes, 'ubicacion_id', v_item.ubicacion_id),
          jsonb_build_object(
            'cantidad_comprometida', v_nuevo,
            'ubicacion_id', v_item.ubicacion_id,
            'lista_id', p_lista_id,
            'lista_picking_item_id', v_item.id
          )
        );
      end if;
    end if;

    update lista_picking_items set estado = 'cancelada' where id = v_item.id;
    v_count := v_count + 1;
  end loop;

  update listas_picking set estado = 'cancelada' where id = p_lista_id;
  return jsonb_build_object('status', 'ok', 'items_cancelados', v_count);
end;
$$;

grant execute on function cancelar_lista_picking(uuid, uuid) to service_role;
