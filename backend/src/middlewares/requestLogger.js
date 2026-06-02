const logger = require("../utils/logger");

// Registra cada request al finalizar la respuesta: método, ruta, status y
// latencia (ms). No registra cuerpos ni cabeceras (evita filtrar tokens/PII).
// Omite /health para no saturar con los health checks del hosting.
function requestLogger(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/health") return;
    const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
    const nivel =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[nivel]("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms,
    });
  });
  next();
}

module.exports = requestLogger;
