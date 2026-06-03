# Pasos urgentes de infraestructura — WMS MACHO

Guía click-a-click para desbloquear producción. Estos pasos **no** son código:
hay que hacerlos en los paneles de Supabase / Render / Netlify. Mientras no se
hagan, los flujos de picking/saldos/recepción responden **error 500**.

Datos del proyecto (a fecha de esta guía):

| Pieza | Valor |
|---|---|
| Supabase (ref) | `vbzvlcwukvyijgqxozrg` |
| Backend (Render) | `https://wms-macho-backend.onrender.com` |
| Frontend (Netlify) | `https://wms-macho.netlify.app` |

> Orden recomendado: **1 → 2 → 3 → 4**. El paso 1 es el que más desbloquea.

---

## Paso 1 — Aplicar los 4 (5) SQL en Supabase ⏱️ ~10 min

1. Entra a **supabase.com** → tu proyecto → menú izquierdo **SQL Editor** → **New query**.
2. Abre cada archivo del repo en `backend/sql/`, **copia TODO su contenido**,
   pégalo en el editor y pulsa **Run** (▶). Hazlo **uno por uno, en este orden**:

   1. `2026-05-28_sesion_unica.sql`  *(solo si vas a usar `SINGLE_SESSION=true`)*
   2. `2026-06-01_rpc_entregar_saldo.sql`
   3. `2026-06-01_rpc_picking_saldos.sql`
   4. `2026-06-01_rpc_recepciones.sql`
   5. `2026-06-01_rpc_cancelar_lista.sql`
   6. `2026-06-02_rpc_reservar_picking.sql`

3. Si una función recién creada no aparece para la API, ejecuta una vez:

   ```sql
   notify pgrst, 'reload schema';
   ```

4. **Verificación** — pega y ejecuta esto. Cada línea debe devolver un JSON con
   `"status": "not_found"` (¡eso es ÉXITO! significa que la función existe y
   corre). Si ves error `PGRST202` / "function does not exist", ese SQL no quedó
   aplicado.

   ```sql
   select entregar_saldo('00000000-0000-0000-0000-000000000000', null);
   select confirmar_caja_saldos('00000000-0000-0000-0000-000000000000', null);
   select bajar_caja('00000000-0000-0000-0000-000000000000', null, null);
   select confirmar_recepcion('00000000-0000-0000-0000-000000000000', null);
   select confirmar_recepcion_directo('00000000-0000-0000-0000-000000000000', null);
   select cancelar_lista_picking('00000000-0000-0000-0000-000000000000', null);
   select reservar_inventario_picking('00000000-0000-0000-0000-000000000000', 1);
   ```

---

## Paso 2 — Rotar la SUPABASE_SERVICE_KEY ⏱️ ~5 min

La key estuvo en el historial de git, así que se considera comprometida.

1. Supabase → **Settings** (engranaje) → **API**.
2. En **Project API keys**, junto a `service_role`, usa **Reveal/Rotate** para
   generar una nueva *service role key*. Cópiala.
3. Ve a **Render** → tu servicio backend → **Environment** → edita
   `SUPABASE_SERVICE_KEY` con el nuevo valor → **Save changes** (Render redeploya).
4. (Prudencia) Rota también la `anon` key y actualiza `VITE_ANON_KEY` en Netlify.

> Si el repo es público, además habría que limpiar el historial con BFG/`git
> filter-repo` (reescribe historia, requiere coordinación). Para repo privado,
> rotar la key es suficiente.

---

## Paso 3 — Cerrar CORS y conectar frontend↔backend ⏱️ ~5 min

**En Render (backend) → Environment:**

| Variable | Valor |
|---|---|
| `NETLIFY_SITE` | `wms-macho` |
| `SUPABASE_URL` | `https://vbzvlcwukvyijgqxozrg.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(la nueva del paso 2)* |

> `NETLIFY_SITE=wms-macho` cierra el CORS permisivo (hoy acepta cualquier
> `*.netlify.app`) y lo restringe a tu sitio + sus previews.

**En Netlify (frontend) → Site configuration → Environment variables:**

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://wms-macho-backend.onrender.com` |
| `VITE_SUPABASE_URL` | `https://vbzvlcwukvyijgqxozrg.supabase.co` |
| `VITE_ANON_KEY` | *(anon key de Supabase)* |

> Tras cambiar variables en Netlify hay que **redeploy** (Deploys → Trigger
> deploy → Clear cache and deploy site) porque las `VITE_*` se incrustan en build.

> ⚠️ Si algún día cambias la URL del backend, actualiza también `connect-src` en
> `frontend/public/_headers` o el navegador bloqueará las llamadas (CSP).

---

## Paso 4 — Verificar que Render instala dependencias ⏱️ ~2 min

1. Render → backend → **Settings** → **Build & Deploy**.
2. **Build Command** debe instalar deps: `pnpm install` (o `npm install`).
3. Revisa el último deploy log: que `express-rate-limit` y demás queden instalados.

---

## Paso 5 — Humo de verificación (después de 1-4)

- `GET https://wms-macho-backend.onrender.com/health` → `{ "status": "ok" }`.
- **Login** con un usuario válido; navegar al panel según rol.
- **Montacarguista**: escanear una caja → baja inventario una vez; 2º intento
  responde "Esta caja ya fue bajada".
- **Saldos**: escanear caja de reposición → sube SALDOS una vez.
- **Listas viejas**: las generadas antes de `ubicacion_codigo` no muestran
  ubicación. Recomendado: cancelar/borrar esas listas y **regenerarlas** desde
  el panel admin para que traigan la ubicación.

---

Referencia ampliada: ver `DESPLIEGUE.md` (runbook completo de operación).
