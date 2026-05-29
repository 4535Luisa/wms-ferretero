const supabase = require("../utils/supabase");

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Token inválido" });
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, bodega_id, activo")
    .eq("email", data.user.email)
    .single();

  if (!usuario) {
    return res.status(401).json({ error: "Usuario no encontrado en el sistema" });
  }
  if (usuario.activo === false) {
    return res.status(403).json({ error: "Usuario inactivo" });
  }

  // Sesión única: el id de sesión del header debe coincidir con el vigente.
  if (process.env.SINGLE_SESSION === "true") {
    const headerSesion = req.headers["x-session-id"];
    const { data: sesRow } = await supabase
      .from("usuarios")
      .select("sesion_actual")
      .eq("id", usuario.id)
      .single();
    if (sesRow?.sesion_actual && sesRow.sesion_actual !== headerSesion) {
      return res.status(401).json({
        error: "Sesión cerrada: se inició sesión en otro dispositivo",
      });
    }
  }

  req.usuario = usuario;
  next();
};

// Autorización por rol. El administrador siempre tiene acceso (superusuario).
const requireRoles =
  (...roles) =>
  (req, res, next) => {
    const rol = req.usuario?.rol;
    if (!rol) return res.status(401).json({ error: "No autenticado" });
    if (rol === "administrador" || roles.includes(rol)) return next();
    return res
      .status(403)
      .json({ error: "No tienes permisos para realizar esta acción" });
  };

module.exports = authMiddleware;
module.exports.requireRoles = requireRoles;
