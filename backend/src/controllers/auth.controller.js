const crypto = require("crypto");
const supabase = require("../utils/supabase");

const SINGLE_SESSION = process.env.SINGLE_SESSION === "true";

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const { data: usuario, error: errorUsuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email)
    .single();

  if (errorUsuario || !usuario) {
    return res
      .status(404)
      .json({ error: "Usuario no encontrado en el sistema" });
  }

  if (!usuario.activo) {
    return res.status(403).json({ error: "Usuario inactivo" });
  }

  // Sesión única: genera un id de sesión y lo guarda; cualquier sesión previa
  // queda invalidada (railguard). Requiere la columna usuarios.sesion_actual.
  let sesion_id = null;
  if (SINGLE_SESSION) {
    sesion_id = crypto.randomUUID();
    await supabase
      .from("usuarios")
      .update({ sesion_actual: sesion_id })
      .eq("id", usuario.id);
  }

  return res.json({
    token: data.session.access_token,
    sesion_id,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      bodega_id: usuario.bodega_id,
    },
  });
};

const logout = async (req, res) => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return res.status(500).json({ error: "Error al cerrar sesión" });
  }
  return res.json({ mensaje: "Sesión cerrada correctamente" });
};

// Crea los usuarios semilla. Las credenciales NO se hardcodean: se leen de la
// variable de entorno SEED_USERS (JSON), o del body de la petición (admin).
// Ejemplo SEED_USERS: [{"email":"admin@indurruedas.com","password":"..."}]
const crearUsuarios = async (req, res) => {
  let usuarios = req.body?.usuarios;

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    if (process.env.SEED_USERS) {
      try {
        usuarios = JSON.parse(process.env.SEED_USERS);
      } catch {
        return res
          .status(500)
          .json({ error: "SEED_USERS no es un JSON válido" });
      }
    }
  }

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return res.status(400).json({
      error:
        "Define la variable SEED_USERS (JSON) o envía 'usuarios' en el body. No hay credenciales en el código.",
    });
  }

  const resultados = [];
  for (const u of usuarios) {
    if (!u?.email || !u?.password) {
      resultados.push({ email: u?.email, ok: false, error: "email/password requerido" });
      continue;
    }
    const { error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    resultados.push({ email: u.email, ok: !error, error: error?.message });
  }

  return res.json(resultados);
};

module.exports = { login, logout, crearUsuarios };
