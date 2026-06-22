const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  crearAjuste,
  listarAjustes,
  aprobarAjuste,
  rechazarAjuste,
} = require("../controllers/ajustes.controller");

router.post("/", requireRoles("inventarios"), crearAjuste);
router.get("/", requireRoles("inventarios", "gerente_logistico"), listarAjustes);
router.patch(
  "/:id/aprobar",
  requireRoles("gerente_logistico"),
  requireUuidParam("id"),
  aprobarAjuste,
);
router.patch(
  "/:id/rechazar",
  requireRoles("gerente_logistico"),
  requireUuidParam("id"),
  rechazarAjuste,
);

module.exports = router;
