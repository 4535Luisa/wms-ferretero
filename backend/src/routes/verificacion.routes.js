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

router.get("/", requireRoles("jefe_bodega"), listarPorVerificar);
router.get(
  "/:id",
  requireRoles("jefe_bodega"),
  requireUuidParam("id"),
  detalleVerificacion,
);
router.patch(
  "/:id/items/:itemId/verificar",
  requireRoles("jefe_bodega"),
  requireUuidParam("id"),
  requireUuidParam("itemId"),
  verificarItem,
);
router.patch(
  "/:id/confirmar",
  requireRoles("jefe_bodega"),
  requireUuidParam("id"),
  confirmarVerificacion,
);

module.exports = router;
