const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarKits,
  definirKit,
  ensamblar,
  desensamblar,
} = require("../controllers/kits.controller");

router.get("/", requireRoles("inventarios", "gerente_logistico"), listarKits);
router.post("/", requireRoles("inventarios"), definirKit);
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
