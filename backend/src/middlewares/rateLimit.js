const rateLimit = require("express-rate-limit");

// Limitador general para toda la API: protege contra abuso/DoS básico.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 1000, // solicitudes por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intenta más tarde" },
});

// Limitador estricto para autenticación: mitiga fuerza bruta en el login.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 20, // intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de inicio de sesión, intenta más tarde",
  },
});

module.exports = { apiLimiter, authLimiter };
