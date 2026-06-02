-- Tarea D (atomicidad) — ronda 2: confirmar caja SALDOS y bajar caja (picking).
--
-- Mismo enfoque que entregar_saldo: cada operación corre en UNA transacción y
-- bloquea las filas afectadas (FOR UPDATE) para ser idempotente y a prueba de
-- carreras (evita doble suma/descuento de inventario bajo concurrencia).
--
-- Tras aplicar, si las RPC no aparecen: notify pgrst, 'reload schema';

-- 1) Confirmación física de una caja de reposición con destino SALDOS:
--    el inventario de SALDOS sube SOLO aquí (railguard).
create or replace function confirmar_caja_saldos(p_item_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_item          lista_picking_items%rowtype;
  v_saldos_bodega uuid;
  v_inv           inventario%rowtype;
  v_cantidad      numeric;
  v_antes         numeric;
  v_despues       numeric;
begin
  select * into v_item from lista_picking_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_item.destino_saldos is distinct from true then
    return jsonb_build_object('status', 'not_saldos');
  end if;
  if v_item.estado = 'recibida_saldos' then
    return jsonb_build_object('status', 'already_done');
  end if;

  select id into v_saldos_bodega from bodegas where codigo = 'SALDOS' limit 1;
  if v_saldos_bodega is null then
    return jsonb_build_object('status', 'no_saldos_bodega');
  end if;

  v_cantidad := coalesce(v_item.cantidad_unidades, 0);

  select * into v_inv
  from inventario
  where producto_id = v_item.producto_id
    and bodega_id = v_saldos_bodega
  order by created_at asc
  limit 1
  for update;

  v_antes := coalesce(v_inv.cantidad_disponible, 0);
  v_despues := v_antes + v_cantidad;

  if v_inv.id is not null then
    update inventario
       set cantidad_disponible = v_despues, updated_at = now()
     where id = v_inv.id;
  else
    insert into inventario (producto_id, bodega_id, cantidad_disponible)
    values (v_item.producto_id, v_saldos_bodega, v_cantidad);
  end if;

  update lista_picking_items set estado = 'recibida_saldos' where id = v_item.id;

  insert into bitacora
    (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
  values (
    p_usuario_id,
    'RECEPCION_SALDOS',
    'inventario',
    v_item.producto_id,
    jsonb_build_object('cantidad_disponible', v_antes, 'bodega_id', v_saldos_bodega),
    jsonb_build_object(
      'cantidad_disponible', v_despues,
      'bodega_id', v_saldos_bodega,
      'referencia', v_item.referencia,
      'lista_picking_item_id', v_item.id
    )
  );

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function confirmar_caja_saldos(uuid, uuid) to service_role;


-- 2) Núcleo atómico de "bajar caja": transición del ítem (pendiente -> bajada),
--    vínculo de estiba, descuento de inventario y liberación de lo comprometido,
--    + bitácora. Las validaciones (foto de estiba, propiedad de la lista) y los
--    efectos no críticos (notificaciones, estado de la lista) quedan en el
--    backend; aquí va solo lo que debe ser atómico e idempotente.
create or replace function bajar_caja(
  p_item_id uuid,
  p_usuario_id uuid,
  p_estiba_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_item       lista_picking_items%rowtype;
  v_inv        inventario%rowtype;
  v_antes_disp numeric;
  v_antes_comp numeric;
  v_nueva_disp numeric;
  v_nuevo_comp numeric;
begin
  select * into v_item from lista_picking_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Idempotencia: si ya no está pendiente, no se vuelve a descontar.
  if v_item.estado is distinct from 'pendiente' then
    return jsonb_build_object('status', 'already_done');
  end if;

  update lista_picking_items set estado = 'bajada' where id = v_item.id;

  -- Vincula la estiba al ítem del pedido (para que el operario sepa dónde está).
  if p_estiba_id is not null and v_item.pedido_id is not null then
    update pedido_items
       set estiba_id = p_estiba_id
     where pedido_id = v_item.pedido_id
       and producto_id = v_item.producto_id;
  end if;

  -- Descuenta el disponible y libera lo comprometido (la reserva se materializa
  -- en salida real). Sólo si el ítem tiene ubicación.
  if v_item.ubicacion_id is not null then
    select * into v_inv
    from inventario
    where producto_id = v_item.producto_id
      and ubicacion_id = v_item.ubicacion_id
    order by created_at asc
    limit 1
    for update;

    if v_inv.id is not null then
      v_antes_disp := coalesce(v_inv.cantidad_disponible, 0);
      v_antes_comp := coalesce(v_inv.cantidad_comprometida, 0);
      v_nueva_disp := greatest(0, v_antes_disp - coalesce(v_item.cantidad_unidades, 0));
      v_nuevo_comp := greatest(0, v_antes_comp - coalesce(v_item.cantidad_unidades, 0));

      update inventario
         set cantidad_disponible = v_nueva_disp,
             cantidad_comprometida = v_nuevo_comp,
             updated_at = now()
       where id = v_inv.id;

      insert into bitacora
        (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
      values (
        p_usuario_id,
        'PICKING',
        'inventario',
        v_item.producto_id,
        jsonb_build_object(
          'cantidad_disponible', v_antes_disp,
          'cantidad_comprometida', v_antes_comp,
          'ubicacion_id', v_item.ubicacion_id
        ),
        jsonb_build_object(
          'cantidad_disponible', v_nueva_disp,
          'cantidad_comprometida', v_nuevo_comp,
          'ubicacion_id', v_item.ubicacion_id,
          'pedido_id', v_item.pedido_id,
          'lista_id', v_item.lista_id
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'pedido_id', v_item.pedido_id,
    'producto_id', v_item.producto_id,
    'referencia', v_item.referencia,
    'descripcion', v_item.descripcion,
    'destino_saldos', v_item.destino_saldos,
    'lista_id', v_item.lista_id
  );
end;
$$;

grant execute on function bajar_caja(uuid, uuid, uuid) to service_role;
