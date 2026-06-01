const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  toggleUsuario,
  listarBodegas,
} = require("../controllers/usuarios.controller");

router.get("/", requireRoles("administrador"), listarUsuarios);
router.post("/", requireRoles("administrador"), crearUsuario);
router.put("/:id", requireRoles("administrador"), actualizarUsuario);
router.patch("/:id/toggle", requireRoles("administrador"), toggleUsuario);
router.get("/bodegas", listarBodegas);

module.exports = router;
