const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const { requireRoles } = authMiddleware;
const {
  login,
  logout,
  crearUsuarios,
} = require("../controllers/auth.controller");

router.post("/login", login);
router.post("/logout", logout);
router.post(
  "/crear-usuarios",
  authMiddleware,
  requireRoles("administrador"),
  crearUsuarios,
);

module.exports = router;
