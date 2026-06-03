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
