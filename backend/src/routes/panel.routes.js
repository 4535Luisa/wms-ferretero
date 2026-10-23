const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  enVivo,
  operarios,
  mercancia,
  flujo,
  verMetas,
  guardarMetas,
  actividad,
  ajustes,
} = require("../controllers/panel.controller");

// El administrador entra siempre (requireRoles); el gerente solo consulta.
const LECTURA = requireRoles("gerente_logistico");

router.get("/en-vivo", LECTURA, enVivo);
router.get("/operarios", LECTURA, operarios);
router.get("/mercancia", LECTURA, mercancia);
router.get("/flujo", LECTURA, flujo);
router.get("/metas", LECTURA, verMetas);
router.put("/metas", requireRoles(), guardarMetas);
router.get("/actividad", LECTURA, actividad);
router.get("/ajustes", LECTURA, ajustes);

module.exports = router;
