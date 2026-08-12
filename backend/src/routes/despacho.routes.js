const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarPorDespachar,
  detalleDespacho,
  registrarDespacho,
} = require("../controllers/despacho.controller");

router.get("/", requireRoles("administrador"), listarPorDespachar);
router.get(
  "/:id",
  requireRoles("administrador"),
  requireUuidParam("id"),
  detalleDespacho,
);
router.patch(
  "/:id",
  requireRoles("administrador"),
  requireUuidParam("id"),
  registrarDespacho,
);

module.exports = router;
