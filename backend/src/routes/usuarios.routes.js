const express = require("express");
const router = express.Router();
const {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  toggleUsuario,
  listarBodegas,
} = require("../controllers/usuarios.controller");

router.get("/", listarUsuarios);
router.post("/", crearUsuario);
router.put("/:id", actualizarUsuario);
router.patch("/:id/toggle", toggleUsuario);
router.get("/bodegas", listarBodegas);

module.exports = router;
