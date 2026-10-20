// Helpers de validación de inputs reutilizables en los controllers.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Convierte a número finito. Devuelve null si el valor no es un número válido
// (incluye "", null, undefined, "abc", NaN, Infinity).
function toFiniteNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Middleware: valida que un parámetro de ruta sea un UUID antes de tocar la BD.
function requireUuidParam(nombre) {
  return (req, res, next) => {
    if (!isUuid(req.params[nombre])) {
      return res.status(400).json({ error: `Parámetro ${nombre} inválido` });
    }
    next();
  };
}

// Valor seguro para interpolar en un filtro .or() de PostgREST. Una coma o un
// paréntesis en texto del usuario permitía añadir condiciones al filtro. Si el
// valor trae caracteres reservados se envía entre comillas dobles (escapando
// " y \), como indica la documentación de PostgREST; si no, va tal cual.
function valorFiltro(v) {
  const s = String(v ?? "");
  if (!/[,.:()"\\]/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

module.exports = {
  isUuid,
  isEmail,
  toFiniteNumber,
  requireUuidParam,
  valorFiltro,
  UUID_RE,
};
