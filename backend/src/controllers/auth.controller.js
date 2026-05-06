const supabase = require("../utils/supabase");

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

  return res.json({
    token: data.session.access_token,
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

const crearUsuarios = async (req, res) => {
  const usuarios = [
    { email: "admin@indurruedas.com", password: "Admin2024*" },
    {
      email: "montacarguista@indurruedas.com",
      password: "Montacarguista2024*",
    },
    { email: "operario1@indurruedas.com", password: "Operario2024*" },
    { email: "operario2@indurruedas.com", password: "Operario2024*" },
    { email: "saldos@indurruedas.com", password: "Saldos2024*" },
    { email: "jefebodega@indurruedas.com", password: "Jefebodega2024*" },
    { email: "gerente@indurruedas.com", password: "Gerente2024*" },
    { email: "inventarios@indurruedas.com", password: "Inventarios2024*" },
  ];

  const resultados = [];

  for (const u of usuarios) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    resultados.push({ email: u.email, ok: !error, error: error?.message });
  }

  return res.json(resultados);
};

module.exports = { login, logout, crearUsuarios };
