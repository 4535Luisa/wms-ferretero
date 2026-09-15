const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const { requireRoles } = authMiddleware;
const {
  login,
  logout,
  cambiarPassword,
  obtenerSesiones,
  crearUsuarios,
} = require("../controllers/auth.controller");

router.post("/login", login);
router.post("/logout", authMiddleware, logout);
router.post("/cambiar-password", authMiddleware, cambiarPassword);
router.get(
  "/sesiones",
  authMiddleware,
  requireRoles("administrador"),
  obtenerSesiones,
);
router.post(
  "/crear-usuarios",
  authMiddleware,
  requireRoles("administrador"),
  crearUsuarios,
);

module.exports = router;
