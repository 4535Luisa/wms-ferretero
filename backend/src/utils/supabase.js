const { createClient } = require("@supabase/supabase-js");

// Cliente con service role para TODAS las consultas del backend. Nunca debe
// guardar una sesión de usuario: si lo hiciera, supabase-js usaría el JWT de
// ese usuario en lugar de la service key para las consultas siguientes.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Cliente efímero y aislado para verificar credenciales (signInWithPassword).
// Se crea uno por llamada para que la sesión del usuario no contamine el
// cliente compartido ni se mezcle entre requests concurrentes.
function crearClienteAuth() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

module.exports = supabase;
module.exports.crearClienteAuth = crearClienteAuth;
