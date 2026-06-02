-- Tarea D (atomicidad): entrega de saldo al operario en UNA transacción.
--
-- Problema que resuelve: el controller hacía leer-stock -> chequear -> descontar
-- en pasos separados (PostgREST no da transacciones). Dos llamadas concurrentes
-- podían pasar ambas el chequeo de stock y descontar doble. Esta función corre
-- en una sola transacción y bloquea las filas (FOR UPDATE), de modo que la
-- segunda llamada espera y luego ve el estado ya actualizado (idempotente).
--
-- Devuelve un jsonb con { status, ... }. La notificación al operario se deja
-- fuera (no es crítica): el backend la inserta tras un status = 'ok'.
--
-- IMPORTANTE: tras crear/reemplazar la función, Supabase suele recargar el
-- esquema de PostgREST automáticamente; si la RPC no aparece, ejecutar:
--   notify pgrst, 'reload schema';

create or replace function entregar_saldo(p_saldo_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_saldo         saldos%rowtype;
  v_saldos_bodega uuid;
  v_inv           inventario%rowtype;
  v_cantidad      numeric;
  v_antes         numeric;
  v_despues       numeric;
begin
  -- Bloquea el saldo: idempotencia + evita doble entrega concurrente.
  select * into v_saldo from saldos where id = p_saldo_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_saldo.estado = 'entregado' then
    return jsonb_build_object('status', 'already_done');
  end if;

  select id into v_saldos_bodega from bodegas where codigo = 'SALDOS' limit 1;
  if v_saldos_bodega is null then
    return jsonb_build_object('status', 'no_saldos_bodega');
  end if;

  v_cantidad := coalesce(v_saldo.cantidad_total, 0);

  -- Bloquea la fila de inventario más antigua de SALDOS para ese producto
  -- (mismo criterio que usaba el controller: la primera por created_at).
  select * into v_inv
  from inventario
  where producto_id = v_saldo.producto_id
    and bodega_id = v_saldos_bodega
  order by created_at asc
  limit 1
  for update;

  v_antes := coalesce(v_inv.cantidad_disponible, 0);
  if v_inv.id is null or v_antes < v_cantidad then
    return jsonb_build_object(
      'status', 'insufficient_stock',
      'antes', v_antes,
      'requerido', v_cantidad
    );
  end if;

  v_despues := v_antes - v_cantidad;

  update inventario
     set cantidad_disponible = v_despues,
         updated_at = now()
   where id = v_inv.id;

  update saldos set estado = 'entregado' where id = v_saldo.id;

  insert into bitacora
    (usuario_id, accion, tabla, registro_id, valores_antes, valores_despues)
  values (
    p_usuario_id,
    'ENTREGA_SALDOS',
    'inventario',
    v_saldo.producto_id,
    jsonb_build_object('cantidad_disponible', v_antes, 'bodega_id', v_saldos_bodega),
    jsonb_build_object(
      'cantidad_disponible', v_despues,
      'bodega_id', v_saldos_bodega,
      'operario_id', v_saldo.operario_id,
      'saldo_id', v_saldo.id
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'producto_id', v_saldo.producto_id,
    'operario_id', v_saldo.operario_id,
    'cantidad', v_cantidad
  );
end;
$$;

-- PostgREST llama la función con el service_role del backend.
grant execute on function entregar_saldo(uuid, uuid) to service_role;
