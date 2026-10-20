const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  registrarConteo,
  listarConteos,
  generarAjuste,
  listarFamilias,
  programarConteoFamilia,
} = require("../controllers/conteos.controller");

router.post("/", requireRoles("inventarios"), registrarConteo);
router.get("/", requireRoles("inventarios", "gerente_logistico"), listarConteos);
router.get(
  "/familias",
  requireRoles("inventarios", "gerente_logistico"),
  listarFamilias,
);
router.post(
  "/programar",
  requireRoles("inventarios", "gerente_logistico"),
  programarConteoFamilia,
);
router.patch(
  "/:id/generar-ajuste",
  requireRoles("inventarios"),
  requireUuidParam("id"),
  generarAjuste,
);

module.exports = router;
