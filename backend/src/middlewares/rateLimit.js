const rateLimit = require("express-rate-limit");

// Limitador general para toda la API: protege contra abuso/DoS básico.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 1000, // solicitudes por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intenta más tarde" },
});

// Limitador de autenticación por IP. Toda la bodega comparte la IP pública,
// así que el tope es amplio; la fuerza bruta por cuenta la frena el bloqueo
// por IP+email del controlador de login (5 fallos -> 15 min).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 100, // intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de inicio de sesión, intenta más tarde",
  },
});

module.exports = { apiLimiter, authLimiter };
