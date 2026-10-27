// Arnés de pruebas de integración contra la base REAL, en modo solo lectura.
//
// - Carga la app Express real con sus rutas, permisos y controladores.
// - Reemplaza solo la autenticación: el encabezado "x-prueba-rol" elige un
//   usuario real activo de ese rol (sin contraseñas ni tokens).
// - Toda ruta que no sea GET queda "desarmada": después de los chequeos de
//   rol, en vez del controlador responde 299. Así se prueban los permisos de
//   las rutas que escriben sin escribir nada.
// - Los GET que escriben en la base también se desarman (lista GET_QUE_ESCRIBEN).
require("dotenv").config({ quiet: true });
const path = require("path");
const fs = require("fs");

const RUTA_AUTH = require.resolve("../src/middlewares/auth.middleware");
const real = require(RUTA_AUTH);
const supabase = require("../src/utils/supabase");

const ROLES = [
  "administrador",
  "gerente_logistico",
  "inventarios",
  "facturacion",
  "montacarguista",
  "operario",
  "saldos",
];

// GET con efectos (marcan, generan o registran algo): no se ejecutan.
const GET_QUE_ESCRIBEN = new Set([
  "/api/alertas/pedidos-demorados", // crea alertas y notificaciones
]);

const usuariosPorRol = {};

function authFalsa(req, res, next) {
  const rol = req.headers["x-prueba-rol"];
  if (!rol) return res.status(401).json({ error: "Token requerido" });
  const u = usuariosPorRol[rol];
  if (!u) return res.status(401).json({ error: `Sin usuario de prueba para ${rol}` });
  req.usuario = { ...u, auth_id: null };
  next();
}
authFalsa.requireRoles = real.requireRoles;
require.cache[RUTA_AUTH].exports = authFalsa;

const esRequireRoles = (fn) => fn.toString().includes("No tienes permisos");
const desarmado = (req, res) => res.status(299).json({ desarmado: true });

// Rutas montadas en app.js: prefijo + router.
function leerRutas() {
  const src = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  const archivos = Object.fromEntries(
    [...src.matchAll(/const (\w+Routes) = require\("\.\/routes\/([^"]+)"\)/g)].map((m) => [m[1], m[2]]),
  );
  const rutas = [];
  for (const m of src.matchAll(/app\.use\("([^"]+)",\s*(authMiddleware,\s*)?(\w+Routes)\)/g)) {
    const router = require(path.join(__dirname, "../src/routes", archivos[m[3]]));
    for (const capa of router.stack) {
      if (!capa.route) continue;
      for (const metodo of Object.keys(capa.route.methods)) {
        const ruta = m[1] + capa.route.path;
        const conRol = capa.route.stack.some((s) => esRequireRoles(s.handle));
        const autenticada = !!m[2] || capa.route.stack.some((s) => s.handle === authFalsa);
        const escribe = metodo !== "get" || GET_QUE_ESCRIBEN.has(ruta);
        if (escribe) {
          // Conserva los chequeos de rol y reemplaza lo demás.
          const guardias = capa.route.stack.filter(
            (s) => s.handle === authFalsa || esRequireRoles(s.handle),
          );
          const ultima = capa.route.stack[capa.route.stack.length - 1];
          ultima.handle = desarmado;
          capa.route.stack = [...guardias, ultima];
        }
        rutas.push({ metodo: metodo.toUpperCase(), ruta, autenticada, conRol, escribe });
      }
    }
  }
  return rutas;
}

async function preparar() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, bodega_id, activo")
    .eq("activo", true);
  if (error) throw new Error("No se pudo leer usuarios: " + error.message);
  for (const u of data) if (!usuariosPorRol[u.rol]) usuariosPorRol[u.rol] = u;
  // Roles sin cuenta activa: usuario simulado (solo importa el rol).
  for (const rol of ROLES)
    if (!usuariosPorRol[rol])
      usuariosPorRol[rol] = { id: null, nombre: "Prueba " + rol, email: null, rol, bodega_id: null, activo: true, simulado: true };
  const rutas = leerRutas();
  const app = require("../src/app");
  return { app, rutas, usuariosPorRol };
}

// Reemplaza :param por un valor de ejemplo.
function rellenar(ruta, valores = {}) {
  return ruta.replace(/:(\w+)/g, (_, p) => valores[p] ?? "00000000-0000-0000-0000-000000000000");
}

module.exports = { preparar, rellenar, ROLES, supabase };
