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
function errorHandler(err, req, res, next) {
  logError(`${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Error interno del servidor" });
}

// Rutas no encontradas (404 en formato JSON consistente).
function notFoundHandler(req, res) {
  res.status(404).json({ error: "Recurso no encontrado" });
}

module.exports = { sendServerError, errorHandler, notFoundHandler, logError };
