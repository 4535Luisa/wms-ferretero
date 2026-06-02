# WMS Ferretero — Backend

API REST (Node.js + Express 5) sobre Supabase (PostgreSQL) para el WMS.

## Stack

- **Express 5** — servidor HTTP y rutas.
- **@supabase/supabase-js** — acceso a datos (usando la _service role key_).
- **helmet**, **cors**, **express-rate-limit** — seguridad.
- **node:test** — pruebas (runner nativo, sin dependencias extra).

## Requisitos

- Node.js 18+ (probado en 20/24).
- **pnpm** (el repo usa `pnpm-lock.yaml`).

## Instalación y ejecución

```bash
pnpm install
pnpm dev      # desarrollo con nodemon
pnpm start    # producción
pnpm test     # corre node --test (suite de lógica pura)
```

El servidor levanta en `PORT` (por defecto 3000). Al arrancar valida las
variables de entorno requeridas y **falla rápido** si faltan.

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. **Nunca** se commitea `.env`.

| Variable | Req. | Descripción |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (privilegiada, **bypassa RLS**). Solo backend. |
| `PORT` | — | Puerto del servidor (default 3000). |
| `CORS_ORIGINS` | — | Orígenes exactos permitidos, separados por coma. |
| `NETLIFY_SITE` | — | Nombre del sitio Netlify: permite solo ese sitio + sus previews. Sin esto, CORS queda permisivo para cualquier `*.netlify.app` (con advertencia al arrancar). |
| `SINGLE_SESSION` | — | Si es `"true"`, activa sesión única por usuario (requiere la migración `sesion_unica`). |
| `SEED_USERS` | — | (Opcional) Semilla de usuarios iniciales para `crear-usuarios`. |

> `SUPABASE_ANON_KEY` la usa el **frontend**, no el backend.

## Migraciones SQL (Supabase)

El esquema vive en Supabase; el repo solo versiona las migraciones en
`backend/sql/`. **Aplícalas en el SQL Editor de Supabase** (en orden):

| Archivo | Qué hace |
|---|---|
| `2026-05-28_sesion_unica.sql` | Soporte de sesión única (`SINGLE_SESSION`). |
| `2026-06-01_rpc_entregar_saldo.sql` | RPC `entregar_saldo` (transaccional). |
| `2026-06-01_rpc_picking_saldos.sql` | RPC `confirmar_caja_saldos` y `bajar_caja`. |
| `2026-06-01_rpc_recepciones.sql` | RPC `confirmar_recepcion` y `confirmar_recepcion_directo`. |
| `2026-06-01_rpc_cancelar_lista.sql` | RPC `cancelar_lista_picking` (libera comprometido). |

Las funciones RPC son **obligatorias**: el backend las llama vía
`supabase.rpc(...)` para garantizar atomicidad. Sin aplicarlas, esos endpoints
responden 500 (`PGRST202 – function not found`). Si la RPC no aparece tras
crearla: `notify pgrst, 'reload schema';`

## Estructura

```
src/
  app.js                 # montaje de Express, middlewares y rutas
  index.js               # arranque + validación de entorno (fail-fast)
  controllers/           # lógica por recurso
  routes/                # definición de endpoints + requireRoles
  middlewares/
    auth.middleware.js   # auth + requireRoles + sesión única
    rateLimit.js         # límites general y de login
    requestLogger.js     # log estructurado por request
  utils/
    supabase.js          # cliente Supabase
    errors.js            # error handler global + sendServerError
    validate.js          # isUuid / isEmail / toFiniteNumber
    cors.js              # opciones CORS por entorno
    env.js               # validación de variables al arranque
    logger.js            # logger estructurado JSON
    picking.js           # splitCajaSaldo / ORDEN_BODEGAS
sql/                     # migraciones (aplicar en Supabase)
test/                    # node --test
```

## Notas de seguridad

- **Autorización por rol** con `requireRoles(...)` en las rutas (el
  administrador es superusuario). Las recepciones se aíslan por bodega del
  usuario no-admin.
- **Rate limiting**: límite general en `/api` y estricto en
  `/api/auth/login`. Detrás de un único proxy (Render/Railway) está
  `trust proxy = 1`.
- **Errores**: nunca se devuelve el detalle interno de Supabase al cliente; se
  loguea en el servidor y se responde un mensaje genérico.

Ver el runbook de despliegue en [`../DESPLIEGUE.md`](../DESPLIEGUE.md).
