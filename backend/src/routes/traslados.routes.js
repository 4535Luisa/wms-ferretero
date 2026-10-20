const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  crearTraslado,
  listarTraslados,
  confirmarTraslado,
  cancelarTraslado,
} = require("../controllers/traslados.controller");

router.post("/", requireRoles("inventarios", "gerente_logistico"), crearTraslado);
router.get("/", requireRoles("inventarios", "gerente_logistico"), listarTraslados);
router.patch(
  "/:id/confirmar",
  requireRoles("inventarios", "gerente_logistico"),
  requireUuidParam("id"),
  confirmarTraslado,
);
router.patch(
  "/:id/cancelar",
  requireRoles("inventarios", "gerente_logistico"),
  requireUuidParam("id"),
  cancelarTraslado,
);

module.exports = router;
