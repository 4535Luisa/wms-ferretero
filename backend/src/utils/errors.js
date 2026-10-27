// Manejo centralizado de errores.
// Objetivo: loguear el detalle real en el servidor pero NUNCA exponerlo al
// cliente (evita information disclosure de queries/constraints de Supabase).

const logger = require("./logger");

function logError(context, error) {
  const detail = error?.message || error?.toString?.() || String(error);
  logger.error(`Error en ${context || "request"}`, { detail });
}

// Para usar dentro de los controllers cuando Supabase devuelve { error }.
function sendServerError(res, error, req) {
  const context = req ? `${req.method} ${req.originalUrl}` : "";
  logError(context, error);
  return res.status(500).json({ error: "Error procesando la solicitud" });
}

// Middleware global: captura excepciones no controladas en los handlers.
// Errores del cliente que lanza express.json() (cuerpo mal formado o
// demasiado grande): se responden con su código 4xx, no como 500.
const ERRORES_CUERPO = {
  "entity.parse.failed": [400, "El cuerpo de la petición no es JSON válido"],
  "entity.too.large": [413, "El cuerpo de la petición es demasiado grande"],
};

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const cliente = ERRORES_CUERPO[err?.type];
  if (cliente) return res.status(cliente[0]).json({ error: cliente[1] });
  logError(`${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "Error interno del servidor" });
}

// Rutas no encontradas (404 en formato JSON consistente).
function notFoundHandler(req, res) {
  res.status(404).json({ error: "Recurso no encontrado" });
}

module.exports = { sendServerError, errorHandler, notFoundHandler, logError };
