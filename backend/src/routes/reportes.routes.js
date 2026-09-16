const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  kpis,
  filtros,
  movimientos,
  generarAlertasInventario,
  tiempoAlistamiento,
  referenciasMasDespachadas,
} = require("../controllers/reportes.controller");

router.get("/kpis", requireRoles("gerente_logistico", "administrador"), kpis);
router.get(
  "/filtros",
  requireRoles("gerente_logistico", "administrador"),
  filtros,
);
router.get(
  "/movimientos",
  requireRoles("gerente_logistico", "administrador"),
  movimientos,
);
router.post(
  "/alertas",
  requireRoles("gerente_logistico", "administrador"),
  generarAlertasInventario,
);
router.get(
  "/tiempo-alistamiento",
  requireRoles("administrador", "gerente_logistico"),
  tiempoAlistamiento,
);
router.get(
  "/referencias-despachadas",
  requireRoles("administrador", "gerente_logistico"),
  referenciasMasDespachadas,
);

module.exports = router;
