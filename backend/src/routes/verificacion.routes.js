const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarPorVerificar,
  detalleVerificacion,
  verificarItem,
  confirmarSaldoItem,
  confirmarVerificacion,
  registrarDiferencia,
  confirmarConDiferencias,
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
  "/:id/items/:itemId/saldo",
  requireRoles("administrador"),
  requireUuidParam("id"),
  requireUuidParam("itemId"),
  confirmarSaldoItem,
);
router.patch(
  "/:id/confirmar",
  requireRoles("administrador"),
  requireUuidParam("id"),
  confirmarVerificacion,
);
router.post(
  "/:id/items/:itemId/diferencia",
  requireRoles("administrador"),
  registrarDiferencia,
);
router.post(
  "/:id/confirmar-diferencias",
  requireRoles("administrador"),
  confirmarConDiferencias,
);

module.exports = router;
