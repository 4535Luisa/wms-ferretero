// Script de alertas proactivas (agendable). Genera las alertas de inventario
// (quiebre / sobrestock) y de kits preensamblados por debajo del mínimo, creando
// notificaciones para inventarios y gerencia. Deduplicado por día, así que es
// seguro correrlo varias veces.
//
// Uso:
//   node scripts/generar-alertas.js
//
// Variables de entorno requeridas (las mismas del backend):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
// (En local se cargan desde backend/.env vía dotenv; en hosting las inyecta el
//  panel de variables de entorno.)
//
// Agendarlo (ver DESPLIEGUE.md §10): Render Cron Job, GitHub Actions schedule o
// Supabase pg_cron+pg_net hacia los endpoints POST /api/reportes/alertas y
// POST /api/kits/alertas.

require("dotenv").config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY",
    }),
  );
  process.exit(1);
}

const {
  generarAlertasInventarioCore,
} = require("../src/controllers/reportes.controller");
const { alertarPreensambleCore } = require("../src/controllers/kits.controller");

(async () => {
  try {
    const inventario = await generarAlertasInventarioCore({});
    const preensamble = await alertarPreensambleCore();
    console.log(
      JSON.stringify({
        ok: true,
        generado_en: new Date().toISOString(),
        inventario,
        preensamble,
      }),
    );
    process.exit(0);
  } catch (err) {
    console.error(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
    );
    process.exit(1);
  }
})();
