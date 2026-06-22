const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  crearDevolucion,
  listarDevoluciones,
} = require("../controllers/devoluciones.controller");

router.post("/", requireRoles("jefe_bodega"), crearDevolucion);
router.get("/", requireRoles("jefe_bodega"), listarDevoluciones);

module.exports = router;
