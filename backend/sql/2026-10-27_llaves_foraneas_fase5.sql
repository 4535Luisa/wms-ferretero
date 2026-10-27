-- Llaves foráneas que faltaban en las tablas de la fase 5.
--
-- ajustes_inventario, traslados y mini_conteos se crearon sin FOREIGN KEY, y
-- PostgREST (Supabase) necesita esas relaciones para las consultas con
-- productos(...), bodegas(...), etc. Sin ellas, GET /api/ajustes,
-- /api/traslados, /api/conteos y /api/panel/ajustes responden 500.
--
-- Se puede ejecutar más de una vez: cada llave se crea solo si no existe.
-- El 2026-10-27 las tres tablas estaban vacías, así que no hay datos que
-- puedan romper las llaves.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('ajustes_inventario', 'producto_id',         'productos'),
      ('ajustes_inventario', 'bodega_id',           'bodegas'),
      ('ajustes_inventario', 'ubicacion_id',        'ubicaciones'),
      ('ajustes_inventario', 'solicitado_por',      'usuarios'),
      ('ajustes_inventario', 'aprobado_por',        'usuarios'),
      ('traslados',          'producto_id',         'productos'),
      ('traslados',          'bodega_origen_id',    'bodegas'),
      ('traslados',          'bodega_destino_id',   'bodegas'),
      ('traslados',          'ubicacion_origen_id', 'ubicaciones'),
      ('traslados',          'solicitado_por',      'usuarios'),
      ('traslados',          'confirmado_por',      'usuarios'),
      ('mini_conteos',       'producto_id',         'productos'),
      ('mini_conteos',       'bodega_id',           'bodegas'),
      ('mini_conteos',       'ubicacion_id',        'ubicaciones'),
      ('mini_conteos',       'contado_por',         'usuarios'),
      ('mini_conteos',       'ajuste_id',           'ajustes_inventario')
    ) as t(tabla, columna, destino)
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f'
        and c.conrelid = ('public.' || r.tabla)::regclass
        and a.attname = r.columna
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I (id)',
        r.tabla, r.tabla || '_' || r.columna || '_fkey', r.columna, r.destino
      );
      raise notice 'Creada: %.% -> %', r.tabla, r.columna, r.destino;
    end if;
  end loop;
end $$;

-- Que la API de Supabase vea las relaciones nuevas de inmediato.
notify pgrst, 'reload schema';
