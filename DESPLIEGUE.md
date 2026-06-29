# Despliegue y operación — WMS Ferretero

Runbook para desplegar el sistema y los pasos manuales que **no** viven en el
código. Arquitectura: **backend** (Express/Supabase) en Render/Railway,
**frontend** (React/Vite) en Netlify, **base de datos** en Supabase.

---

## 1. Checklist de despliegue (resumen)

1. [ ] Aplicar las migraciones SQL pendientes en Supabase (ver §2).
2. [ ] Configurar variables de entorno del backend (ver §3).
3. [ ] Configurar variables de entorno del frontend (ver §4).
4. [ ] Verificar que el hosting del backend corre `pnpm install` (ver §5).
5. [ ] (Recomendado) Restringir CORS con `NETLIFY_SITE`/`CORS_ORIGINS` (§3).
6. [ ] Rotar `SUPABASE_SERVICE_KEY` si estuvo expuesta (ver §6).
7. [ ] Desplegar backend y frontend; humo de verificación (ver §7).

---

## 2. Migraciones SQL (Supabase) — OBLIGATORIO

El esquema vive en Supabase. El repo versiona solo las migraciones en
`backend/sql/`. Aplícalas en **SQL Editor** de Supabase, en orden:

1. `2026-05-28_sesion_unica.sql`
2. `2026-06-01_rpc_entregar_saldo.sql`
3. `2026-06-01_rpc_picking_saldos.sql`
4. `2026-06-01_rpc_recepciones.sql`
5. `2026-06-01_rpc_cancelar_lista.sql`
6. `2026-06-02_rpc_reservar_picking.sql`

Migraciones por funcionalidad (fases 2/4/5, también obligatorias):

7. `2026-06-21_notificaciones_leida.sql`
8. `2026-06-21_fase2_devoluciones.sql`
9. `2026-06-21_fase4_despacho.sql`
10. `2026-06-21_fase4_kits.sql`
11. `2026-06-21_fase4_verificacion.sql`
12. `2026-06-21_fase5_ajustes.sql`
13. `2026-06-21_fase5_conteos.sql`
14. `2026-06-21_fase5_traslados.sql`
15. `2026-06-29_fase4_despacho_transportista.sql` — columnas del transportista
    (transportadora, guía, conductor, placa) en `pedidos`.
16. `2026-06-29_fase4_kits_preensamblados.sql` — tabla `kits_config`
    (preensamblado, mínimo de unidades listas, bodega).

Las funciones RPC (archivos 2-6) son **obligatorias**: el backend las invoca
para que las operaciones de inventario sean atómicas/idempotentes. Si no se
aplican, estos flujos responden **500**:

- Entregar saldo, confirmar caja SALDOS, bajar caja (picking).
- Confirmar recepción (con inspección y directa).
- Generar listas de picking y reposición SALDOS (reserva atómica de stock).

Si una RPC recién creada no aparece para PostgREST:

```sql
notify pgrst, 'reload schema';
```

**Verificación rápida** (debe devolver `not_found`, no `PGRST202`):

```sql
select entregar_saldo('00000000-0000-0000-0000-000000000000', null);
select reservar_inventario_picking('00000000-0000-0000-0000-000000000000', 1);
```

---

## 3. Variables de entorno — Backend (Render/Railway)

| Variable | Req. | Notas |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL del proyecto. |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key. **Secreta** — solo backend. |
| `PORT` | — | Lo suele inyectar el hosting. |
| `CORS_ORIGINS` | — | Orígenes exactos, coma-separados (ej. dominio propio). |
| `NETLIFY_SITE` | — | Nombre del sitio Netlify para restringir CORS a ese sitio + previews. |
| `SINGLE_SESSION` | — | `"true"` activa sesión única (requiere migración `sesion_unica`). |
| `SEED_USERS` | — | Opcional, semilla de usuarios. |

> **CORS**: sin `NETLIFY_SITE` ni `CORS_ORIGINS`, el backend acepta **cualquier**
> `*.netlify.app` (modo permisivo de respaldo, con advertencia en logs). Para
> cerrarlo, define `NETLIFY_SITE=<tu-sitio>` (si tu URL es
> `https://<tu-sitio>.netlify.app`) o `CORS_ORIGINS=https://<tu-dominio>`.

---

## 4. Variables de entorno — Frontend (Netlify)

| Variable | Req. | Notas |
|---|---|---|
| `VITE_API_URL` | ✅ | URL pública del backend (ej. `https://...onrender.com`). |
| `VITE_SUPABASE_URL` | ✅ | URL del proyecto Supabase. |
| `VITE_ANON_KEY` | ✅ | Anon key (pública, va al navegador). |

> El frontend es SPA: el routing del lado cliente requiere el fallback a
> `index.html` (ver `frontend/public/_redirects`).

---

## 5. Dependencias del backend

El hosting **debe** instalar dependencias desde `package.json` + `pnpm-lock.yaml`
(p. ej. `pnpm install`). Esto es necesario para `express-rate-limit` y demás.

> Nota: el repo trae `backend/node_modules/` versionado (heredado). El commit de
> Fase 4/5 **no** incluye cambios de `node_modules`; confía en `pnpm install`.

---

## 6. Rotación de la Service Key

`backend/.env` estuvo versionado en el historial de git, por lo que la
`SUPABASE_SERVICE_KEY` previa debe considerarse comprometida:

1. Supabase → **Settings → API** → rota la _service role key_ (y, por prudencia,
   la anon key).
2. Actualiza las variables de entorno en el hosting (backend y frontend).
3. (Opcional) Si el repo es público o el riesgo es alto, limpia el historial con
   `git filter-repo`/BFG (reescribe historia, requiere `force-push` coordinado).

---

## 7. Verificación post-despliegue (humo)

- `GET /health` → `{ "status": "ok" }`.
- **Login** con un usuario válido y navegación al panel según rol.
- **Picking**: el montacarguista baja una caja → inventario baja una vez; un 2º
  intento responde "Esta caja ya fue bajada" (idempotente).
- **Saldos**: confirmar caja sube SALDOS una vez; entregar baja SALDOS una vez;
  reintentos responden "ya fue confirmada/entregada".
- **Recepción**: confirmar suma inventario una vez; reconfirmar responde "La
  recepción ya fue confirmada".
- Si el token expira o se inicia sesión en otro dispositivo (con
  `SINGLE_SESSION=true`), el frontend redirige a login automáticamente (401).

---

## 8. Seguridad del frontend (CSP / cabeceras)

`frontend/public/_headers` (Netlify lo aplica a todo lo servido) define CSP y
cabeceras de seguridad para mitigar XSS y clickjacking. Como el token vive en
`localStorage`, la pieza clave es `script-src 'self'` **sin** `'unsafe-inline'`.

- ⚠️ `connect-src` debe incluir la URL del backend (`VITE_API_URL`). Hoy apunta a
  `https://wms-macho-backend.onrender.com`. **Si cambias de backend/dominio,
  actualiza esa URL en `_headers`** o las llamadas a la API quedarán bloqueadas.
- (Opcional) Reducir XSS aún más: bajar el TTL del JWT en Supabase
  (**Auth → Settings**); el frontend ya hace logout automático ante 401.

---

## 9. Pruebas

```bash
cd backend && pnpm test      # node --test (lógica pura)
cd frontend && pnpm lint     # ESLint
```
