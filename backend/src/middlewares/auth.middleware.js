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
    .select("id, nombre, rol, bodega_id")
    .eq("email", data.user.email)
    .single();

  req.usuario = usuario;
  next();
};

module.exports = authMiddleware;
