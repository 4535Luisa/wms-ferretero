const crypto = require("crypto");
const supabase = require("../utils/supabase");

const SINGLE_SESSION = process.env.SINGLE_SESSION !== "false";
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

// Registra un intento de login fallido por IP y bloquea si supera el maximo
const registrarIntentoFallido = async (ip) => {
  const { data } = await supabase
    .from("intentos_login")
    .select("id, intentos, bloqueado_hasta")
    .eq("ip", ip)
    .single();

  if (data) {
    const nuevosIntentos = (data.intentos || 0) + 1;
    const bloqueado = nuevosIntentos >= MAX_INTENTOS;
    await supabase
      .from("intentos_login")
      .update({
        intentos: nuevosIntentos,
        bloqueado_hasta: bloqueado
          ? new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000).toISOString()
          : null,
        ultimo_intento: new Date().toISOString(),
      })
      .eq("ip", ip);
  } else {
    await supabase.from("intentos_login").insert({
      ip,
      intentos: 1,
      ultimo_intento: new Date().toISOString(),
    });
  }
};

// Verifica si la IP esta bloqueada
const verificarBloqueoIp = async (ip) => {
  const { data } = await supabase
    .from("intentos_login")
    .select("bloqueado_hasta, intentos")
    .eq("ip", ip)
    .single();

  if (!data) return null;
  if (!data.bloqueado_hasta) return null;

  const bloqueadoHasta = new Date(data.bloqueado_hasta);
  if (bloqueadoHasta > new Date()) {
    const minutosRestantes = Math.ceil((bloqueadoHasta - Date.now()) / 60000);
    return { bloqueado: true, minutosRestantes };
  }

  // Bloqueo expirado — limpiar
  await supabase
    .from("intentos_login")
    .update({ intentos: 0, bloqueado_hasta: null })
    .eq("ip", ip);

  return null;
};

// Limpia los intentos al hacer login exitoso
const limpiarIntentosIp = async (ip) => {
  await supabase
    .from("intentos_login")
    .update({ intentos: 0, bloqueado_hasta: null })
    .eq("ip", ip);
};

// Registra el evento de sesion en el log
const registrarSesion = async (usuario_id, ip, dispositivo, accion) => {
  try {
    await supabase.from("sesiones_log").insert({
      usuario_id,
      ip,
      dispositivo: dispositivo || "desconocido",
      accion,
    });
  } catch {
    // best-effort — no bloquea el flujo principal
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "desconocida";
  const dispositivo = req.headers["user-agent"] || "desconocido";

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contrasena son requeridos" });
  }

  // Verificar bloqueo por IP — best-effort, no bloquea el login si falla
  try {
    const bloqueo = await verificarBloqueoIp(ip);
    if (bloqueo?.bloqueado) {
      await registrarSesion(null, ip, dispositivo, "bloqueado").catch(() => {});
      return res.status(429).json({
        error: `IP bloqueada por ${bloqueo.minutosRestantes} minuto${bloqueo.minutosRestantes !== 1 ? "s" : ""} debido a multiples intentos fallidos`,
      });
    }
  } catch {
    // best-effort — continuar con el login
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    await registrarIntentoFallido(ip);
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

  // Verificar expiracion de contrasena (90 dias)
  if (usuario.password_expires_at) {
    const expira = new Date(usuario.password_expires_at);
    const diasRestantes = Math.ceil((expira - Date.now()) / 86400000);
    if (expira < new Date()) {
      return res.status(403).json({
        error:
          "La contrasena ha expirado. Contacta al administrador para restablecerla",
        codigo: "PASSWORD_EXPIRED",
      });
    }
    // Aviso 7 dias antes
    if (diasRestantes <= 7) {
      res.setHeader("x-password-expira-en", String(diasRestantes));
    }
  }

  // Sesion unica — genera token de sesion e invalida los anteriores
  let sesion_id = null;
  if (SINGLE_SESSION) {
    sesion_id = crypto.randomUUID();
    await supabase
      .from("usuarios")
      .update({ sesion_actual: sesion_id })
      .eq("id", usuario.id);
  }

  // Limpiar intentos fallidos al login exitoso — best-effort
  limpiarIntentosIp(ip).catch(() => {});

  // Registrar sesion — best-effort
  registrarSesion(usuario.id, ip, dispositivo, "login").catch(() => {});

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
  const usuario_id = req.usuario?.id;
  const ip = req.ip || req.headers["x-forwarded-for"] || "desconocida";
  const dispositivo = req.headers["user-agent"] || "desconocido";

  if (usuario_id) {
    // Invalidar sesion actual
    if (SINGLE_SESSION) {
      await supabase
        .from("usuarios")
        .update({ sesion_actual: null })
        .eq("id", usuario_id);
    }
    await registrarSesion(usuario_id, ip, dispositivo, "logout");
  }

  await supabase.auth.signOut();
  return res.json({ mensaje: "Sesion cerrada correctamente" });
};

// Cambiar contrasena — reinicia el contador de expiracion
const cambiarPassword = async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  const usuario_id = req.usuario?.id;
  const email = req.usuario?.email;

  if (!password_actual || !password_nuevo) {
    return res
      .status(400)
      .json({ error: "password_actual y password_nuevo son requeridos" });
  }

  if (password_nuevo.length < 8) {
    return res
      .status(400)
      .json({ error: "La nueva contrasena debe tener al menos 8 caracteres" });
  }

  // Verificar contrasena actual
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password: password_actual,
  });

  if (loginError) {
    return res
      .status(401)
      .json({ error: "La contrasena actual es incorrecta" });
  }

  // Cambiar contrasena en Supabase Auth
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    req.usuario?.auth_id || usuario_id,
    { password: password_nuevo },
  );

  if (updateError) {
    return res.status(500).json({ error: "Error al cambiar la contrasena" });
  }

  // Actualizar fecha de expiracion
  await supabase
    .from("usuarios")
    .update({
      password_changed_at: new Date().toISOString(),
      password_expires_at: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .eq("id", usuario_id);

  return res.json({ mensaje: "Contrasena actualizada correctamente" });
};

// Log de sesiones para el administrador
const obtenerSesiones = async (req, res) => {
  const { usuario_id, limit = 50 } = req.query;

  let query = supabase
    .from("sesiones_log")
    .select("*, usuarios(nombre, email, rol)")
    .order("created_at", { ascending: false })
    .limit(Number(limit));

  if (usuario_id) query = query.eq("usuario_id", usuario_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};

const crearUsuarios = async (req, res) => {
  let usuarios = req.body?.usuarios;

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    if (process.env.SEED_USERS) {
      try {
        usuarios = JSON.parse(process.env.SEED_USERS);
      } catch {
        return res
          .status(500)
          .json({ error: "SEED_USERS no es un JSON valido" });
      }
    }
  }

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return res
      .status(400)
      .json({ error: "Define SEED_USERS o envia usuarios en el body" });
  }

  const resultados = [];
  for (const u of usuarios) {
    if (!u?.email || !u?.password) {
      resultados.push({
        email: u?.email,
        ok: false,
        error: "email/password requerido",
      });
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

module.exports = {
  login,
  logout,
  cambiarPassword,
  obtenerSesiones,
  crearUsuarios,
};
