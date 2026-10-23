-- El rol jefe_bodega se unificó con administrador: las cuentas que lo tenían
-- pasan a administrador. Se puede ejecutar más de una vez sin efecto extra.
update usuarios
set rol = 'administrador'
where rol = 'jefe_bodega';

-- Comprobación: debe devolver 0.
select count(*) as quedan_jefe_bodega from usuarios where rol = 'jefe_bodega';
