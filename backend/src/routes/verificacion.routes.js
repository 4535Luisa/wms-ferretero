const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarPorVerificar,
  detalleVerificacion,
  verificarItem,
  confirmarVerificacion,
} = require("../controllers/verificacion.controller");

router.get("/", requireRoles("administrador"), listarPorVerificar);
router.get(
  "/:id",
  requireRoles("administrador"),
  requireUuidParam("id"),
  detalleVerificacion,
);
router.patch(
  "/:id/items/:itemId/verificar",
  requireRoles("administrador"),
  requireUuidParam("id"),
  requireUuidParam("itemId"),
  verificarItem,
);
router.patch(
  "/:id/confirmar",
  requireRoles("administrador"),
  requireUuidParam("id"),
  confirmarVerificacion,
);

module.exports = router;
