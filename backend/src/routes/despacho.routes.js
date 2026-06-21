const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { requireUuidParam } = require("../utils/validate");
const {
  listarPorDespachar,
  detalleDespacho,
  registrarDespacho,
} = require("../controllers/despacho.controller");

router.get("/", requireRoles("jefe_bodega"), listarPorDespachar);
router.get(
  "/:id",
  requireRoles("jefe_bodega"),
  requireUuidParam("id"),
  detalleDespacho,
);
router.patch(
  "/:id",
  requireRoles("jefe_bodega"),
  requireUuidParam("id"),
  registrarDespacho,
);

module.exports = router;
