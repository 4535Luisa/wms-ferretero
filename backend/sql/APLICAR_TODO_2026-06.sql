-- ============================================================
-- WMS MACHO — Aplicar TODAS las migraciones (6) en orden.
-- Pega TODO esto en Supabase SQL Editor y dale Run.
-- Re-ejecutable: usa create-or-replace / add-column-if-not-exists.
-- ============================================================


-- ===================== 2026-05-28_sesion_unica.sql =====================

-- Migración: sesión única por usuario (railguard "un usuario no puede tener
-- dos sesiones activas simultáneas").
--
-- Cómo aplicar:
--   1) Ejecuta este SQL en el editor SQL de Supabase (proyecto WMS MACHO).
--   2) En el backend (Render) define la variable de entorno:  SINGLE_SESSION=true
--   3) Redespliega el backend.
--
-- Mientras SINGLE_SESSION no esté en "true", el sistema funciona igual que hoy
-- (esta columna queda sin usar y no afecta nada).

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sesion_actual uuid;

-- Al iniciar sesión, el backend escribe un nuevo uuid en sesion_actual y lo
-- devuelve al cliente (header X-Session-Id). El middleware rechaza con 401
-- cualquier petición cuyo header no coincida con el sesion_actual vigente,
-- invalidando así la sesión anterior.


-- ===================== 2026-06-01_rpc_entregar_saldo.sql =====================

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


-- ===================== 2026-06-01_rpc_picking_saldos.sql =====================

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


-- ===================== 2026-06-01_rpc_recepciones.sql =====================

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


-- ===================== 2026-06-01_rpc_cancelar_lista.sql =====================

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


-- ===================== 2026-06-02_rpc_reservar_picking.sql =====================

-- Reserva atómica de inventario para picking (anti doble-picking).
--
-- Problema que resuelve: la reserva de stock (cantidad_comprometida) se hacía en
-- el backend con un patrón leer-modificar-escribir (read inv.comprometida, luego
-- update comprometida + X). Bajo concurrencia (dos generaciones de listas, doble
-- clic, o generación + reposición SALDOS a la vez) ambas leían el mismo valor y
-- reservaban encima → se comprometía MÁS stock del disponible (doble picking del
-- mismo inventario).
--
-- Esta función hace el incremento condicional en UNA sentencia con bloqueo de
-- fila (FOR UPDATE): solo reserva si hay disponible real suficiente. Idempotencia
-- a nivel de concurrencia: dos llamadas simultáneas se serializan por el lock y
-- la segunda ve el comprometido ya actualizado.
--
-- Aplicar en Supabase SQL Editor. Si no aparece para PostgREST:
--   notify pgrst, 'reload schema';

create or replace function reservar_inventario_picking(
  p_inventario_id uuid,
  p_unidades numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_inv  inventario%rowtype;
  v_disp numeric;
begin
  if p_unidades is null or p_unidades <= 0 then
    return jsonb_build_object('status', 'ok', 'reservado', 0);
  end if;

  select * into v_inv from inventario where id = p_inventario_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Disponible real = físico menos lo ya comprometido por otra lista.
  v_disp := coalesce(v_inv.cantidad_disponible, 0)
          - coalesce(v_inv.cantidad_comprometida, 0);

  if v_disp < p_unidades then
    -- Otro proceso tomó stock entre la lectura del backend y este punto.
    return jsonb_build_object('status', 'insufficient', 'disponible', v_disp);
  end if;

  update inventario
     set cantidad_comprometida = coalesce(cantidad_comprometida, 0) + p_unidades
   where id = v_inv.id;

  return jsonb_build_object('status', 'ok', 'reservado', p_unidades);
end;
$$;


-- Refresca el cache de PostgREST para que las funciones aparezcan en la API.
notify pgrst, 'reload schema';
