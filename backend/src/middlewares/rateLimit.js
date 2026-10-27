const crypto = require("crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

// Toda la bodega sale a internet por la misma IP pública: un límite solo por IP
// se reparte entre todos los usuarios conectados (la campana de cada uno
// consulta cada 20 s). Por eso el límite general se cuenta por sesión (token)
// y, aparte, hay un tope alto por IP contra quien rote tokens falsos.
const claveSesion = (req) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return "ip:" + ipKeyGenerator(req.ip);
  return "t:" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
};

// Limitador general por sesión: protege contra abuso/DoS básico.
const apiLimiter = rateLimit({
  windowMs: VENTANA_MS,
  limit: 1000, // solicitudes por sesión (o por IP sin sesión) en la ventana
  keyGenerator: claveSesion,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intenta más tarde" },
});

// Tope por IP para toda la bodega junta (suma de todas las sesiones).
const ipLimiter = rateLimit({
  windowMs: VENTANA_MS,
  limit: 20000,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intenta más tarde" },
});

const authLimiter = rateLimit({
  windowMs: VENTANA_MS,
  limit: 100, // intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de inicio de sesión, intenta más tarde",
  },
});

module.exports = { apiLimiter, ipLimiter, authLimiter, claveSesion };
