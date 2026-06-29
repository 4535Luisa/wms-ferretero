const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarKits,
  definirKit,
  ensamblar,
  desensamblar,
  configurarPreensamble,
  alertarPreensamble,
} = require("../controllers/kits.controller");

router.get("/", requireRoles("inventarios", "gerente_logistico"), listarKits);
router.post("/", requireRoles("inventarios"), definirKit);

// Preensamblados: configurar mínimo/bodega y generar alertas de reposición.
router.put(
  "/:kitId/preensamble",
  requireRoles("inventarios", "gerente_logistico"),
  requireUuidParam("kitId"),
  configurarPreensamble,
);
router.post(
  "/alertas",
  requireRoles("inventarios", "gerente_logistico"),
  alertarPreensamble,
);
router.post(
  "/:kitId/ensamblar",
  requireRoles("inventarios", "gerente_logistico"),
  requireUuidParam("kitId"),
  ensamblar,
);
// Desensamblar requiere autorización del gerente (railguard Fase 4).
router.post(
  "/:kitId/desensamblar",
  requireRoles("gerente_logistico"),
  requireUuidParam("kitId"),
  desensamblar,
);

module.exports = router;
