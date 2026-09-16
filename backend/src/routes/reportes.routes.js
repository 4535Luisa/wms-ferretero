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

router.get("/kpis", requireRoles("gerente_logistico"), kpis);
router.get("/filtros", requireRoles("gerente_logistico"), filtros);
router.get("/movimientos", requireRoles("gerente_logistico"), movimientos);
router.post(
  "/alertas",
  requireRoles("gerente_logistico"),
  generarAlertasInventario,
);

router.get(
  "/tiempo-alistamiento",
  requireRoles(ADMIN, GERENTE),
  tiempoAlistamiento,
);
router.get(
  "/referencias-despachadas",
  requireRoles(ADMIN, GERENTE),
  referenciasMasDespachadas,
);

module.exports = router;
