// Configuración de CORS dirigida por entorno.
//
// Problema que resuelve: el regex anterior /\.netlify\.app$/ aceptaba CUALQUIER
// subdominio *.netlify.app (incluido el de un atacante). Ahora:
//   - CORS_ORIGINS: lista de orígenes exactos permitidos (coma-separados).
//   - NETLIFY_SITE: nombre del sitio Netlify; habilita SOLO ese sitio y sus
//     previews (deploy-preview-*--sitio.netlify.app, branch--sitio.netlify.app).
//   - Si NO se define NETLIFY_SITE, se mantiene el modo permisivo anterior para
//     no romper el deploy, pero se emite una advertencia al arrancar.
const logger = require("./logger");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function construirCorsOptions() {
  const desdeEnv = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const exactos = new Set([
    "http://localhost:5173",
    "https://wms-macho-backend.onrender.com",
    ...desdeEnv,
  ]);

  const site = (process.env.NETLIFY_SITE || "").trim();
  const netlifyRe = site
    ? new RegExp(`^https://([a-z0-9-]+--)?${escapeRegExp(site)}\\.netlify\\.app$`)
    : null;

  // Respaldo permisivo (comportamiento previo) solo si no se restringió el sitio.
  const permisivoNetlify = !site;
  const netlifyAnyRe = /^https:\/\/[a-z0-9-]+\.netlify\.app$/;
  if (permisivoNetlify) {
    logger.warn(
      "CORS permisivo para *.netlify.app — define NETLIFY_SITE o CORS_ORIGINS para restringir",
    );
  }

  return {
    origin(origin, callback) {
      // Sin Origin: curl, health checks, llamadas server-to-server.
      if (!origin) return callback(null, true);
      const permitido =
        exactos.has(origin) ||
        (netlifyRe && netlifyRe.test(origin)) ||
        (permisivoNetlify && netlifyAnyRe.test(origin));
      // Denegar = no setear cabeceras CORS (el navegador bloquea); no se lanza
      // error para no generar respuestas 500 ruidosas.
      return callback(null, Boolean(permitido));
    },
    credentials: true,
  };
}

module.exports = { construirCorsOptions };
