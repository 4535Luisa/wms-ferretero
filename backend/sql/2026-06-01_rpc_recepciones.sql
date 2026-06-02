-- Tarea D (atomicidad) — ronda 3: confirmación de recepciones.
--
-- Problema: confirmarRecepcion/confirmarRecepcionDirecto sumaban inventario en
-- un loop multi-ítem sin transacción (fallo a la mitad = estado inconsistente)
-- y SIN verificar si la recepción ya estaba confirmada (confirmar dos veces
-- sumaba inventario doble). Estas funciones corren todo en UNA transacción,
-- bloquean la recepción (FOR UPDATE) y son idempotentes.
--
-- Tras aplicar, si las RPC no aparecen: notify pgrst, 'reload schema';

-- 1) Confirmación con inspección: suma SOLO los ítems aprobados/parciales,
--    usando la bodega de cada ítem. Exige que no queden ítems sin inspeccionar.
create or replace function confirmar_recepcion(p_recepcion_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_rec          recepciones%rowtype;
  v_item         record;
  v_inv          inventario%rowtype;
  v_cantidad     numeric;
  v_antes        numeric;
  v_despues      numeric;
  v_sin_procesar integer;
begin
  select * into v_rec from recepciones where id = p_recepcion_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_rec.estado = 'confirmada' then
    return jsonb_build_object('status', 'already_done');
  end if;

  select count(*) into v_sin_procesar
  from recepcion_items
  where recepcion_id = p_recepcion_id and estado in ('pendiente', 'recibido');
  if v_sin_procesar > 0 then
    return jsonb_build_object('status', 'items_sin_inspeccionar');
  end if;

  for v_item in
    select ri.*, p.codigo_interno, p.descripcion_corta
    from recepcion_items ri
    left join productos p on p.id = ri.producto_id
    where ri.recepcion_id = p_recepcion_id
      and ri.estado in ('aprobado', 'parcial')
  loop
    -- Equivalente a (cantidad_aprobada || cantidad_recibida) de JS: 0/NULL -> recibida.
    v_cantidad := coalesce(
      nullif(coalesce(v_item.cantidad_aprobada, 0), 0),
      v_item.cantidad_recibida,
      0
    );

    select * into v_inv
    from inventario
    where producto_id = v_item.producto_id and bodega_id = v_item.bodega_id
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
      values (v_item.producto_id, v_item.bodega_id, v_cantidad);
    end if;

    insert into bitacora
      (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
    values (
      p_usuario_id, 'RECEPCION_CONFIRMADA', 'inventario', v_item.producto_id,
      jsonb_build_object('cantidad_disponible', v_antes, 'bodega_id', v_item.bodega_id),
      jsonb_build_object(
        'cantidad_disponible', v_despues,
        'bodega_id', v_item.bodega_id,
        'proveedor', v_rec.proveedor,
        'factura', v_rec.numero_oc,
        'referencia', v_item.codigo_interno,
        'producto', v_item.descripcion_corta,
        'recepcion_id', p_recepcion_id
      )
    );
  end loop;

  update recepciones set estado = 'confirmada' where id = p_recepcion_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function confirmar_recepcion(uuid, uuid) to service_role;


-- 2) Confirmación directa: suma TODOS los ítems por cantidad_recibida, usando
--    la bodega de la recepción. Exige que haya al menos un ítem.
create or replace function confirmar_recepcion_directo(p_recepcion_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_rec      recepciones%rowtype;
  v_item     record;
  v_inv      inventario%rowtype;
  v_cantidad numeric;
  v_antes    numeric;
  v_despues  numeric;
  v_total    integer;
begin
  select * into v_rec from recepciones where id = p_recepcion_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_rec.estado = 'confirmada' then
    return jsonb_build_object('status', 'already_done');
  end if;

  select count(*) into v_total
  from recepcion_items where recepcion_id = p_recepcion_id;
  if v_total = 0 then
    return jsonb_build_object('status', 'sin_items');
  end if;

  for v_item in
    select ri.*, p.codigo_interno, p.descripcion_corta
    from recepcion_items ri
    left join productos p on p.id = ri.producto_id
    where ri.recepcion_id = p_recepcion_id
  loop
    v_cantidad := coalesce(v_item.cantidad_recibida, 0);

    select * into v_inv
    from inventario
    where producto_id = v_item.producto_id and bodega_id = v_rec.bodega_id
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
      values (v_item.producto_id, v_rec.bodega_id, v_cantidad);
    end if;

    insert into bitacora
      (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
    values (
      p_usuario_id, 'RECEPCION_CONFIRMADA', 'inventario', v_item.producto_id,
      jsonb_build_object('cantidad_disponible', v_antes, 'bodega_id', v_rec.bodega_id),
      jsonb_build_object(
        'cantidad_disponible', v_despues,
        'bodega_id', v_rec.bodega_id,
        'proveedor', v_rec.proveedor,
        'factura', v_rec.numero_oc,
        'producto', v_item.descripcion_corta,
        'referencia', v_item.codigo_interno,
        'recepcion_id', p_recepcion_id
      )
    );
  end loop;

  update recepciones set estado = 'confirmada' where id = p_recepcion_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function confirmar_recepcion_directo(uuid, uuid) to service_role;
