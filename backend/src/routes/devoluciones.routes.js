const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  crearDevolucion,
  listarDevoluciones,
} = require("../controllers/devoluciones.controller");

router.post("/", requireRoles("administrador"), crearDevolucion);
router.get("/", requireRoles("administrador"), listarDevoluciones);

module.exports = router;
