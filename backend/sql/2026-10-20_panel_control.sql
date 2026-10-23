-- Panel de control (administrador y gerente logístico).
--
-- Ejecutar en Supabase → SQL Editor. Se puede pegar completo y es seguro
-- re-ejecutarlo. Solo AÑADE cosas: una tabla de metas, índices y funciones de
-- lectura. No modifica ni borra datos existentes.
--
-- Tras aplicar: notify pgrst, 'reload schema';
--
-- De dónde sale cada dato (sin columnas nuevas en tablas existentes):
--   · Pedido alistado      = pedidos.hora_cierre (cierre del operario).
--   · Caja bajada          = escaneo correcto (bitacora ESCANEO_VERIFICACION
--                            sobre lista_picking_items) de un usuario que no es
--                            de saldos; ese escaneo es el paso previo obligatorio
--                            a bajar la caja.
--   · Lista completada     = lista en estado 'completada'; su hora de fin es el
--                            último escaneo correcto de sus cajas y su duración
--                            va del primer al último escaneo.
--   · Errores de escaneo   = escaneos con resultado distinto de 'ok'.
--   · Faltantes de stock   = bitacora FALTANTE_STOCK_PICKING (el backend la
--                            registra desde esta versión al generar listas).
--   · Días                 = fecha local de la bodega (parámetro p_tz).


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Metas del equipo. Solo el backend (service_role) lee y escribe.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists panel_metas (
  clave      text primary key,
  valor      numeric not null check (valor >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references usuarios(id)
);

alter table panel_metas enable row level security;
revoke all on panel_metas from anon, authenticated;
grant select, insert, update on panel_metas to service_role;

insert into panel_metas (clave, valor) values
  ('pedidos_dia_operario',    8),
  ('tiempo_medio_pedido_min', 50),
  ('errores_escaneo_pct',     1.5),
  ('fuera_hora_limite_dia',   2),
  ('espera_verificacion_min', 90)
on conflict (clave) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Índices para que las consultas del panel no recorran la bitácora entera.
-- ═══════════════════════════════════════════════════════════════════════════
create index if not exists bitacora_accion_created_at_idx
  on bitacora (accion, created_at);
create index if not exists bitacora_registro_id_idx
  on bitacora (registro_id);
create index if not exists bitacora_usuario_created_at_idx
  on bitacora (usuario_id, created_at desc);
create index if not exists sesiones_log_usuario_created_at_idx
  on sesiones_log (usuario_id, created_at desc);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) panel_indicadores: los indicadores que tienen meta, para un rango.
--    Se usa en "En vivo" (rango actual y anterior) y en "Metas" (por semana).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function panel_indicadores(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_tz text default 'America/Bogota'
)
returns jsonb
language sql
stable
as $$
  with cerrados as (
    select p.operario_id, p.hora_asignacion, p.hora_cierre, p.hora_limite,
           (p.hora_cierre at time zone p_tz)::date as dia
      from pedidos p
     where p.hora_cierre >= p_desde and p.hora_cierre < p_hasta
       and p.estado is distinct from 'cancelado'
  ),
  de_operario as (
    select * from cerrados where operario_id is not null
  ),
  escaneos as (
    select b.tabla,
           coalesce(b.valores_despues->>'resultado' = 'ok', false) as ok,
           u.rol
      from bitacora b
      left join usuarios u on u.id = b.usuario_id
     where b.accion = 'ESCANEO_VERIFICACION'
       and b.created_at >= p_desde and b.created_at < p_hasta
  ),
  verificados as (
    select extract(epoch from (p.hora_verificacion - p.hora_cierre)) / 60 as minutos
      from pedidos p
     where p.hora_verificacion >= p_desde and p.hora_verificacion < p_hasta
       and p.hora_cierre is not null
       and p.hora_verificacion >= p.hora_cierre
  ),
  conteos as (
    select
      (select count(*) from cerrados) as pedidos_cerrados,
      (select count(*) from de_operario) as pedidos_operario,
      (select count(distinct (operario_id, dia)) from de_operario) as operario_dias,
      (select count(distinct operario_id) from de_operario) as operarios_activos,
      (select count(distinct dia) from cerrados) as dias_con_cierres,
      (select count(*) from cerrados
        where hora_limite is not null and hora_cierre > hora_limite) as fuera_hora_limite,
      (select avg(extract(epoch from (hora_cierre - hora_asignacion)) / 60)
         from cerrados
        where hora_asignacion is not null and hora_cierre >= hora_asignacion) as tiempo_medio,
      (select count(*) from escaneos) as escaneos,
      (select count(*) from escaneos where not ok) as errores,
      (select count(*) from escaneos
        where ok and tabla = 'lista_picking_items'
          and rol is distinct from 'saldos') as cajas_bajadas,
      (select avg(minutos) from verificados) as espera_verificacion
  )
  select jsonb_build_object(
    'pedidos_cerrados',        pedidos_cerrados,
    'operarios_activos',       operarios_activos,
    'pedidos_dia_operario',    case when operario_dias > 0
                                    then round(pedidos_operario::numeric / operario_dias, 2) end,
    'tiempo_medio_pedido_min', round(tiempo_medio::numeric, 1),
    'escaneos',                escaneos,
    'errores_escaneo',         errores,
    'errores_escaneo_pct',     case when escaneos > 0
                                    then round(100.0 * errores / escaneos, 2) end,
    'cajas_bajadas',           cajas_bajadas,
    'fuera_hora_limite',       fuera_hora_limite,
    'fuera_hora_limite_dia',   case when dias_con_cierres > 0
                                    then round(fuera_hora_limite::numeric / dias_con_cierres, 2) end,
    'espera_verificacion_min', round(espera_verificacion::numeric, 1)
  )
  from conteos;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) panel_en_vivo: pestaña "En vivo".
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function panel_en_vivo(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_prev_desde timestamptz,
  p_prev_hasta timestamptz,
  p_tz text default 'America/Bogota'
)
returns jsonb
language sql
stable
as $$
  with cerrados_estados as (
    select unnest(array['cerrado', 'con_diferencia', 'verificado', 'facturado',
                        'cancelado', 'despachado']) as estado
  ),
  abiertos as (
    select p.*
      from pedidos p
     where p.estado not in (select estado from cerrados_estados)
  ),
  escaneos as (
    select extract(hour from (b.created_at at time zone p_tz))::int as hora,
           coalesce(b.valores_despues->>'resultado' = 'ok', false) as ok
      from bitacora b
     where b.accion = 'ESCANEO_VERIFICACION'
       and b.created_at >= p_desde and b.created_at < p_hasta
  ),
  usuarios_vivo as (
    select u.id, u.nombre, u.rol,
           (select max(s.created_at) from sesiones_log s
             where s.usuario_id = u.id and s.accion = 'login') as ultimo_login,
           (select max(s.created_at) from sesiones_log s
             where s.usuario_id = u.id and s.accion = 'logout') as ultimo_logout,
           ult.accion as ultima_accion,
           ult.created_at as ultima_accion_at,
           ult.pedido_numero as ultima_accion_pedido,
           (select jsonb_build_object(
                     'numero', p.numero,
                     'estado', p.estado,
                     'items', (select count(*) from pedido_items pi where pi.pedido_id = p.id),
                     'completos', (select count(*) from pedido_items pi
                                    where pi.pedido_id = p.id and pi.estado = 'completo'))
              from pedidos p
             where u.rol = 'operario'
               and p.operario_id = u.id
               and p.estado not in (select estado from cerrados_estados)
               and p.estado <> 'pendiente'
             order by p.hora_asignacion desc nulls last
             limit 1) as pedido_actual,
           (select jsonb_build_object(
                     'id', l.id,
                     'bodega', bo.codigo,
                     'estado', l.estado,
                     'cajas', (select count(*) from lista_picking_items li where li.lista_id = l.id),
                     'bajadas', (select count(*) from lista_picking_items li
                                  where li.lista_id = l.id and li.estado <> 'pendiente'))
              from listas_picking l
              left join bodegas bo on bo.id = l.bodega_id
             where u.rol = 'montacarguista'
               and l.montacarguista_id = u.id
               and l.estado in ('asignada', 'en_proceso')
             order by l.created_at
             limit 1) as lista_actual
      from usuarios u
      left join lateral (
        select b.accion, b.created_at, b.valores_despues->>'pedido_numero' as pedido_numero
          from bitacora b
         where b.usuario_id = u.id
         order by b.created_at desc
         limit 1
      ) ult on true
     where u.activo
       and u.rol not in ('administrador', 'gerente_logistico')
  )
  select jsonb_build_object(
    'actual',   panel_indicadores(p_desde, p_hasta, p_tz),
    'anterior', panel_indicadores(p_prev_desde, p_prev_hasta, p_tz),
    'abiertos', (select count(*) from abiertos),
    'abiertos_vencidos', (select count(*) from abiertos
                           where hora_limite is not null and hora_limite < now()),
    'estados', coalesce((
      select jsonb_object_agg(estado, n)
        from (select estado, count(*) as n
                from pedidos
               where estado not in ('facturado', 'cancelado', 'despachado')
               group by estado) s), '{}'::jsonb),
    'facturados_periodo', (select count(*) from pedidos
                            where hora_facturacion >= p_desde and hora_facturacion < p_hasta),
    'alertas', jsonb_build_object(
      'urgentes_en_riesgo', (select count(*) from abiertos
                              where prioridad = 'urgente'
                                and hora_limite is not null
                                and hora_limite < now() + interval '1 hour'),
      'saldos_por_confirmar', (select count(*) from lista_picking_items
                                where destino_saldos and estado = 'bajada'),
      'esperando_verificacion', (select count(*) from pedidos where estado = 'cerrado')
    ),
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'ok', ok_n, 'errores', err_n)
                       order by hora)
        from (select hora,
                     count(*) filter (where ok) as ok_n,
                     count(*) filter (where not ok) as err_n
                from escaneos
               group by hora) h), '[]'::jsonb),
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rol, x.nombre)
        from usuarios_vivo x), '[]'::jsonb)
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) panel_operarios: pestaña "Operarios".
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function panel_operarios(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_tz text default 'America/Bogota'
)
returns jsonb
language sql
stable
as $$
  with cerrados as (
    select p.operario_id, p.hora_asignacion, p.hora_cierre,
           (p.hora_cierre at time zone p_tz)::date as dia
      from pedidos p
     where p.hora_cierre >= p_desde and p.hora_cierre < p_hasta
       and p.estado is distinct from 'cancelado'
       and p.operario_id is not null
  ),
  escaneos as (
    select b.usuario_id, b.tabla, b.registro_id, b.created_at,
           coalesce(b.valores_despues->>'resultado' = 'ok', false) as ok
      from bitacora b
     where b.accion = 'ESCANEO_VERIFICACION'
       and b.created_at >= p_desde and b.created_at < p_hasta
  ),
  diferencias as (
    select p.operario_id, count(*) as n
      from bitacora b
      join pedido_items pi on pi.id = b.registro_id
      join pedidos p on p.id = pi.pedido_id
     where b.accion = 'DIFERENCIA_VERIFICACION'
       and b.created_at >= p_desde and b.created_at < p_hasta
     group by p.operario_id
  ),
  reaperturas as (
    select p.operario_id, count(*) as n
      from bitacora b
      join pedidos p on p.id = b.registro_id
     where b.accion = 'REAPERTURA_PEDIDO'
       and b.created_at >= p_desde and b.created_at < p_hasta
     group by p.operario_id
  ),
  por_operario as (
    select u.id, u.nombre, u.activo,
           (select count(*) from cerrados c where c.operario_id = u.id) as pedidos,
           (select count(distinct c.dia) from cerrados c where c.operario_id = u.id) as dias,
           (select round(avg(extract(epoch from (c.hora_cierre - c.hora_asignacion)) / 60)::numeric, 1)
              from cerrados c
             where c.operario_id = u.id
               and c.hora_asignacion is not null
               and c.hora_cierre >= c.hora_asignacion) as tiempo_medio_min,
           (select count(*) from escaneos e where e.usuario_id = u.id) as escaneos,
           (select count(*) from escaneos e where e.usuario_id = u.id and not e.ok) as errores,
           coalesce((select d.n from diferencias d where d.operario_id = u.id), 0) as diferencias,
           coalesce((select r.n from reaperturas r where r.operario_id = u.id), 0) as reaperturas
      from usuarios u
     where u.rol = 'operario'
  ),
  escaneos_cajas as (
    select e.usuario_id, e.created_at, e.ok
      from escaneos e
      join usuarios u on u.id = e.usuario_id
     where e.tabla = 'lista_picking_items'
       and u.rol is distinct from 'saldos'
  ),
  -- Listas con algún escaneo en el rango; su fin es el último escaneo correcto
  -- de cualquiera de sus cajas (puede caer fuera del rango).
  listas_fin as (
    select l.id, l.montacarguista_id, max(b.created_at) as fin
      from listas_picking l
      join lista_picking_items li on li.lista_id = l.id
      join bitacora b on b.registro_id = li.id
                     and b.accion = 'ESCANEO_VERIFICACION'
                     and b.tabla = 'lista_picking_items'
                     and b.valores_despues->>'resultado' = 'ok'
      join usuarios ub on ub.id = b.usuario_id and ub.rol is distinct from 'saldos'
     where l.estado = 'completada'
       and l.id in (select li2.lista_id
                      from escaneos e2
                      join lista_picking_items li2 on li2.id = e2.registro_id
                     where e2.tabla = 'lista_picking_items')
     group by l.id, l.montacarguista_id
  ),
  por_montacarguista as (
    select u.id, u.nombre, u.activo,
           (select count(*) from escaneos_cajas e where e.usuario_id = u.id and e.ok) as cajas,
           (select count(distinct (e.created_at at time zone p_tz)::date)
              from escaneos_cajas e where e.usuario_id = u.id and e.ok) as dias,
           (select count(*) from listas_fin lf
             where lf.montacarguista_id = u.id
               and lf.fin >= p_desde and lf.fin < p_hasta) as listas,
           (select count(*) from escaneos e where e.usuario_id = u.id) as escaneos,
           (select count(*) from escaneos e where e.usuario_id = u.id and not e.ok) as errores
      from usuarios u
     where u.rol = 'montacarguista'
  )
  select jsonb_build_object(
    'operarios', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.pedidos desc, x.nombre)
        from por_operario x
       where x.activo or x.pedidos > 0 or x.escaneos > 0), '[]'::jsonb),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'pedidos', n, 'operarios', ops)
                       order by dia)
        from (select dia, count(*) as n, count(distinct operario_id) as ops
                from cerrados group by dia) s), '[]'::jsonb),
    'montacarguistas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.cajas desc, x.nombre)
        from por_montacarguista x
       where x.activo or x.cajas > 0 or x.escaneos > 0), '[]'::jsonb)
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6) panel_mercancia: pestaña "Mercancía".
--    p_bodega filtra stock, sin movimiento y ajustes; p_familia filtra todo.
--    "Despachadas" = unidades pedidas de pedidos facturados en el rango.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function panel_mercancia(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_bodega uuid default null,
  p_familia text default null
)
returns jsonb
language sql
stable
as $$
  with prods as (
    select pr.id, pr.codigo_interno, pr.descripcion_corta, pr.created_at
      from productos pr
     where pr.activo
       and (p_familia is null or pr.familia = p_familia)
  ),
  stock as (
    select i.producto_id, i.bodega_id, sum(coalesce(i.cantidad_disponible, 0)) as unidades
      from inventario i
      join prods on prods.id = i.producto_id
     where p_bodega is null or i.bodega_id = p_bodega
     group by i.producto_id, i.bodega_id
  ),
  despachado as (
    select pi.producto_id, sum(coalesce(pi.cantidad_pedida, 0)) as unidades
      from pedido_items pi
      join pedidos p on p.id = pi.pedido_id
      join prods on prods.id = pi.producto_id
     where p.facturado
       and p.hora_facturacion >= p_desde and p.hora_facturacion < p_hasta
     group by pi.producto_id
    having sum(coalesce(pi.cantidad_pedida, 0)) > 0
  ),
  acumulado as (
    select producto_id, unidades,
           sum(unidades) over (order by unidades desc, producto_id) - unidades as antes,
           sum(unidades) over () as total
      from despachado
  ),
  clases as (
    select producto_id, unidades,
           case when antes < 0.7 * total then 'A'
                when antes < 0.9 * total then 'B'
                else 'C' end as clase
      from acumulado
  ),
  stock_picking as (
    select i.producto_id, sum(coalesce(i.cantidad_disponible, 0)) as unidades
      from inventario i
      join bodegas bo on bo.id = i.bodega_id and bo.codigo in ('B8', 'B36', 'B7')
     group by i.producto_id
  ),
  pedidos_rango as (
    select pi.producto_id, count(distinct pi.pedido_id) as pedidos
      from pedido_items pi
      join pedidos p on p.id = pi.pedido_id
      join prods on prods.id = pi.producto_id
     where p.created_at >= p_desde and p.created_at < p_hasta
       and p.estado is distinct from 'cancelado'
     group by pi.producto_id
  ),
  agotadas as (
    select pr.codigo_interno as referencia, pr.descripcion_corta as descripcion,
           pd.pedidos
      from pedidos_rango pd
      join prods pr on pr.id = pd.producto_id
      left join stock_picking sp on sp.producto_id = pd.producto_id
     where coalesce(sp.unidades, 0) <= 0
  ),
  con_pedidos_90 as (
    select distinct pi.producto_id
      from pedido_items pi
      join pedidos p on p.id = pi.pedido_id
     where p.created_at >= p_hasta - interval '90 days' and p.created_at < p_hasta
       and p.estado is distinct from 'cancelado'
  ),
  stock_producto as (
    select s.producto_id, sum(s.unidades) as unidades,
           (array_agg(bo.codigo order by s.unidades desc))[1] as bodega_principal
      from stock s
      left join bodegas bo on bo.id = s.bodega_id
     group by s.producto_id
    having sum(s.unidades) > 0
  ),
  sin_movimiento as (
    select pr.codigo_interno as referencia, pr.descripcion_corta as descripcion,
           sp.bodega_principal as bodega, sp.unidades as stock
      from stock_producto sp
      join prods pr on pr.id = sp.producto_id
     where sp.producto_id not in (select producto_id from con_pedidos_90)
  ),
  ajustes as (
    select a.producto_id, a.tipo, a.sentido, coalesce(a.cantidad, 0) as cantidad
      from ajustes_inventario a
      join prods on prods.id = a.producto_id
     where a.estado = 'aprobado'
       and a.resolved_at >= p_desde and a.resolved_at < p_hasta
       and (p_bodega is null or a.bodega_id = p_bodega)
  ),
  ajustes_ref as (
    select a.producto_id,
           sum(case when a.sentido = 'incremento' then a.cantidad else -a.cantidad end) as neto,
           sum(a.cantidad) as movido,
           count(*) as n,
           string_agg(distinct a.tipo, ', ') as tipos
      from ajustes a
     group by a.producto_id
  )
  select jsonb_build_object(
    'familias', coalesce((
      select jsonb_agg(familia order by familia)
        from (select distinct familia from productos
               where activo and familia is not null and familia <> '') f), '[]'::jsonb),
    'refs_activas',       (select count(*) from prods),
    'refs_nuevas',        (select count(*) from prods
                            where created_at >= p_desde and created_at < p_hasta),
    'unidades_stock',     coalesce((select sum(unidades) from stock), 0),
    'refs_con_stock',     (select count(*) from stock_producto),
    'stock_bodegas', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', codigo, 'unidades', unidades)
                       order by unidades desc)
        from (select coalesce(bo.codigo, '—') as codigo, sum(s.unidades) as unidades
                from stock s
                left join bodegas bo on bo.id = s.bodega_id
               group by bo.codigo) b), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('referencia', pr.codigo_interno,
                                          'descripcion', pr.descripcion_corta,
                                          'unidades', d.unidades)
                       order by d.unidades desc)
        from (select * from despachado order by unidades desc limit 8) d
        join prods pr on pr.id = d.producto_id), '[]'::jsonb),
    'despachado_total', coalesce((select sum(unidades) from despachado), 0),
    'abc', jsonb_build_object(
      'A', jsonb_build_object('refs', (select count(*) from clases where clase = 'A'),
                              'unidades', coalesce((select sum(unidades) from clases where clase = 'A'), 0)),
      'B', jsonb_build_object('refs', (select count(*) from clases where clase = 'B'),
                              'unidades', coalesce((select sum(unidades) from clases where clase = 'B'), 0)),
      'C', jsonb_build_object('refs', (select count(*) from prods)
                                      - (select count(*) from clases where clase in ('A', 'B')),
                              'unidades', coalesce((select sum(unidades) from clases where clase = 'C'), 0))
    ),
    'agotadas_total', (select count(*) from agotadas),
    'agotadas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.pedidos desc, x.referencia)
        from (select * from agotadas order by pedidos desc, referencia limit 300) x), '[]'::jsonb),
    'sin_movimiento_total', (select count(*) from sin_movimiento),
    'sin_movimiento', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.stock desc, x.referencia)
        from (select * from sin_movimiento order by stock desc, referencia limit 300) x), '[]'::jsonb),
    'ajustes', jsonb_build_object(
      'aprobados',  (select count(*) from ajustes),
      'faltantes',  coalesce((select sum(cantidad) from ajustes where sentido = 'decremento'), 0),
      'sobrantes',  coalesce((select sum(cantidad) from ajustes where sentido = 'incremento'), 0),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('referencia', pr.codigo_interno,
                                            'descripcion', pr.descripcion_corta,
                                            'neto', ar.neto, 'ajustes', ar.n,
                                            'tipos', ar.tipos)
                         order by ar.movido desc)
          from (select * from ajustes_ref order by movido desc limit 5) ar
          join prods pr on pr.id = ar.producto_id), '[]'::jsonb)
    )
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7) panel_flujo: pestaña "Flujo".
--    p_prioridad filtra el embudo, los tiempos y los pedidos por día. La
--    comparación entre bodegas es por listas de picking (no se filtra).
--    Fuera de hora límite = cerrado por el operario después de su hora límite,
--    o aún sin cerrar con la hora límite vencida.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function panel_flujo(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_tz text default 'America/Bogota',
  p_prioridad text default null
)
returns jsonb
language sql
stable
as $$
  with ped as (
    select p.*
      from pedidos p
     where p.created_at >= p_desde and p.created_at < p_hasta
       and (p_prioridad is null or p.prioridad = p_prioridad)
  ),
  validos as (
    select * from ped where estado is distinct from 'cancelado'
  ),
  tardes as (
    select v.*,
           (v.hora_limite is not null
            and (v.hora_cierre > v.hora_limite
                 or (v.hora_cierre is null
                     and v.estado not in ('cerrado', 'con_diferencia', 'verificado',
                                          'facturado', 'despachado')
                     and v.hora_limite < now()))) as tarde
      from validos v
  ),
  dias as (
    select d::date as dia
      from generate_series((p_desde at time zone p_tz)::date,
                           ((p_hasta - interval '1 second') at time zone p_tz)::date,
                           interval '1 day') d
  ),
  escaneos as (
    select b.usuario_id, b.tabla, b.registro_id,
           coalesce(b.valores_despues->>'resultado' = 'ok', false) as ok,
           u.rol
      from bitacora b
      left join usuarios u on u.id = b.usuario_id
     where b.accion = 'ESCANEO_VERIFICACION'
       and b.created_at >= p_desde and b.created_at < p_hasta
  ),
  escaneos_lista as (
    select e.*, li.lista_id, l.bodega_id
      from escaneos e
      join lista_picking_items li on li.id = e.registro_id
      join listas_picking l on l.id = li.lista_id
     where e.tabla = 'lista_picking_items'
       and e.rol is distinct from 'saldos'
  ),
  listas_tiempo as (
    select l.id, l.bodega_id, min(b.created_at) as inicio, max(b.created_at) as fin
      from listas_picking l
      join lista_picking_items li on li.lista_id = l.id
      join bitacora b on b.registro_id = li.id
                     and b.accion = 'ESCANEO_VERIFICACION'
                     and b.tabla = 'lista_picking_items'
                     and b.valores_despues->>'resultado' = 'ok'
      join usuarios ub on ub.id = b.usuario_id and ub.rol is distinct from 'saldos'
     where l.estado = 'completada'
       and l.id in (select lista_id from escaneos_lista)
     group by l.id, l.bodega_id
  ),
  por_bodega as (
    select bo.codigo,
           (select count(*) from escaneos_lista e where e.bodega_id = bo.id and e.ok) as cajas,
           (select count(*) from listas_tiempo lt
             where lt.bodega_id = bo.id and lt.fin >= p_desde and lt.fin < p_hasta) as listas,
           (select round(avg(extract(epoch from (lt.fin - lt.inicio)) / 60)::numeric, 1)
              from listas_tiempo lt
             where lt.bodega_id = bo.id and lt.fin >= p_desde and lt.fin < p_hasta) as tiempo_lista_min,
           (select count(*) from escaneos_lista e where e.bodega_id = bo.id) as escaneos,
           (select count(*) from escaneos_lista e where e.bodega_id = bo.id and not e.ok) as errores
      from bodegas bo
     where bo.codigo in ('B8', 'B36', 'B7')
  ),
  faltantes as (
    select b.valores_despues->>'referencia' as referencia,
           coalesce((b.valores_despues->>'cajas_faltantes')::numeric, 0) as cajas
      from bitacora b
     where b.accion = 'FALTANTE_STOCK_PICKING'
       and b.created_at >= p_desde and b.created_at < p_hasta
  )
  select jsonb_build_object(
    'embudo', jsonb_build_object(
      'cargados',    (select count(*) from validos),
      'asignados',   (select count(*) from validos
                       where hora_asignacion is not null or operario_id is not null),
      'alistados',   (select count(*) from validos
                       where hora_cierre is not null
                          or estado in ('cerrado', 'con_diferencia', 'verificado',
                                        'facturado', 'despachado')),
      'verificados', (select count(*) from validos
                       where hora_verificacion is not null
                          or estado in ('verificado', 'facturado', 'despachado')),
      'facturados',  (select count(*) from validos where facturado),
      'cancelados',  (select count(*) from ped where estado = 'cancelado')
    ),
    'tramos', jsonb_build_object(
      'carga_asignacion', (select round(avg(extract(epoch from (hora_asignacion - created_at)) / 60)::numeric, 1)
                             from validos where hora_asignacion >= created_at),
      'asignacion_cierre', (select round(avg(extract(epoch from (hora_cierre - hora_asignacion)) / 60)::numeric, 1)
                              from validos where hora_cierre >= hora_asignacion),
      'cierre_verificacion', (select round(avg(extract(epoch from (hora_verificacion - hora_cierre)) / 60)::numeric, 1)
                                from validos where hora_verificacion >= hora_cierre),
      'verificacion_factura', (select round(avg(extract(epoch from (hora_facturacion - hora_verificacion)) / 60)::numeric, 1)
                                 from validos where hora_facturacion >= hora_verificacion),
      'carga_factura', (select round(avg(extract(epoch from (hora_facturacion - created_at)) / 60)::numeric, 1)
                          from validos where hora_facturacion >= created_at)
    ),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'total', (select count(*) from tardes t
                          where (t.created_at at time zone p_tz)::date = d.dia),
               'tarde', (select count(*) from tardes t
                          where (t.created_at at time zone p_tz)::date = d.dia and t.tarde))
             order by d.dia)
        from dias d), '[]'::jsonb),
    'bodegas', coalesce((
      select jsonb_agg(to_jsonb(x) order by array_position(array['B8', 'B36', 'B7'], x.codigo))
        from por_bodega x), '[]'::jsonb),
    'saldos', jsonb_build_object(
      'cajas_confirmadas', (select count(*) from escaneos
                             where rol = 'saldos' and tabla = 'lista_picking_items' and ok),
      'escaneos', (select count(*) from escaneos where rol = 'saldos'),
      'errores',  (select count(*) from escaneos where rol = 'saldos' and not ok)
    ),
    'faltantes', jsonb_build_object(
      'registros', (select count(*) from faltantes),
      'cajas', coalesce((select sum(cajas) from faltantes), 0),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('referencia', referencia, 'veces', n, 'cajas', cajas)
                         order by n desc, cajas desc)
          from (select referencia, count(*) as n, sum(cajas) as cajas
                  from faltantes group by referencia
                 order by count(*) desc, sum(cajas) desc limit 5) f), '[]'::jsonb)
    )
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8) Permisos: solo el backend (service_role) ejecuta estas funciones.
-- ═══════════════════════════════════════════════════════════════════════════
revoke execute on function panel_indicadores(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function panel_en_vivo(timestamptz, timestamptz, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function panel_operarios(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function panel_mercancia(timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke execute on function panel_flujo(timestamptz, timestamptz, text, text) from public, anon, authenticated;

grant execute on function panel_indicadores(timestamptz, timestamptz, text) to service_role;
grant execute on function panel_en_vivo(timestamptz, timestamptz, timestamptz, timestamptz, text) to service_role;
grant execute on function panel_operarios(timestamptz, timestamptz, text) to service_role;
grant execute on function panel_mercancia(timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function panel_flujo(timestamptz, timestamptz, text, text) to service_role;

notify pgrst, 'reload schema';
