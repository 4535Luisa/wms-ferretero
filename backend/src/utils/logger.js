// Logger estructurado mínimo (sin dependencias). Emite una línea JSON por
// evento para facilitar el parseo en agregadores de logs (Render/Railway).
function emit(level, message, meta) {
  const entry = { ts: new Date().toISOString(), level, message };
  if (meta !== undefined) entry.meta = meta;
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
};
