const supabase = require("../utils/supabase");
const { sendServerError } = require("../utils/errors");
const { isEmail } = require("../utils/validate");

// Roles asignables desde la gestión de usuarios (crear y editar).
const ROLES_ASIGNABLES = [
  "operario",
  "montacarguista",
  "saldos",
  "gerente_logistico",
  "inventarios",
  "facturacion",
];

const listarUsuarios = async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*, bodegas(nombre, codigo)")
    .order("created_at", { ascending: false });

  if (error) return sendServerError(res, error, req);
  return res.json(data);
};

const crearUsuario = async (req, res) => {
  const { email, nombre, rol, bodega_id, password } = req.body;

  if (!email || !nombre || !rol || !password) {
    return res
      .status(400)
      .json({ error: "Email, nombre, rol y contraseña son obligatorios" });
  }

  if (!isEmail(email)) {
    return res.status(400).json({ error: "Email inválido" });
  }
  if (String(password).length < 8) {
    return res
      .status(400)
      .json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  if (!ROLES_ASIGNABLES.includes(rol)) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }
    return sendServerError(res, authError, req);
  }

  const { data, error } = await supabase
    .from("usuarios")
    .insert({ email, nombre, rol, bodega_id: bodega_id || null, activo: true })
    .select("*, bodegas(nombre, codigo)")
    .single();

  if (error) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return sendServerError(res, error, req);
  }

  return res.json({ data, mensaje: "Usuario creado correctamente" });
};

const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, rol, bodega_id } = req.body;

  // Mismos roles que al crear. Si el rol no cambia (p. ej. se edita el nombre
  // de un administrador existente) se acepta tal cual.
  if (rol !== undefined && !ROLES_ASIGNABLES.includes(rol)) {
    const { data: actual } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", id)
      .single();
    if (!actual)
      return res.status(404).json({ error: "Usuario no encontrado" });
    if (actual.rol !== rol)
      return res.status(400).json({ error: "Rol inválido" });
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update({ nombre, rol, bodega_id })
    .eq("id", id)
    .select("*, bodegas(nombre, codigo)")
    .single();

  if (error) return sendServerError(res, error, req);
  return res.json({ data, mensaje: "Usuario actualizado" });
};

const toggleUsuario = async (req, res) => {
  const { id } = req.params;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("activo")
    .eq("id", id)
    .single();

  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  const { data, error } = await supabase
    .from("usuarios")
    .update({ activo: !usuario.activo })
    .eq("id", id)
    .select()
    .single();

  if (error) return sendServerError(res, error, req);
  return res.json({
    data,
    mensaje: `Usuario ${data.activo ? "activado" : "desactivado"}`,
  });
};

const listarBodegas = async (req, res) => {
  const { data, error } = await supabase
    .from("bodegas")
    .select("id, nombre, codigo")
    .eq("activa", true)
    .order("codigo");

  if (error) return sendServerError(res, error, req);
  return res.json(data);
};

module.exports = {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  toggleUsuario,
  listarBodegas,
};
