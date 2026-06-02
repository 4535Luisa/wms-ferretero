// Validación de variables de entorno requeridas al arranque (fail-fast):
// evita que el servidor arranque con un cliente Supabase mal configurado y
// falle recién en la primera consulta.
const REQUERIDAS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];

function validarEnv() {
  const faltantes = REQUERIDAS.filter((clave) => !process.env[clave]);
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${faltantes.join(", ")}`,
    );
  }
}

module.exports = { validarEnv, REQUERIDAS };
