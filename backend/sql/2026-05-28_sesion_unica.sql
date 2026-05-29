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
