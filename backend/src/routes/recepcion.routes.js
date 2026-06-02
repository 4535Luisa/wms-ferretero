const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  crearRecepcion,
  obtenerRecepciones,
  obtenerRecepcion,
  registrarCantidad,
  inspeccionarItem,
  confirmarRecepcion,
  agregarItemRecepcion,
  confirmarRecepcionDirecto,
} = require("../controllers/recepcion.controller");

router.post("/", requireRoles("jefe_bodega"), crearRecepcion);
router.get("/", requireRoles("jefe_bodega"), obtenerRecepciones);
router.get("/:id", requireRoles("jefe_bodega"), obtenerRecepcion);
router.post("/:id/items", requireRoles("jefe_bodega"), agregarItemRecepcion);
router.patch("/:id/confirmar", requireRoles("jefe_bodega"), confirmarRecepcion);
router.patch(
  "/:id/confirmar-directo",
  requireRoles("jefe_bodega"),
  confirmarRecepcionDirecto,
);
router.patch(
  "/items/:item_id/cantidad",
  requireRoles("jefe_bodega"),
  registrarCantidad,
);
router.patch(
  "/items/:item_id/inspeccion",
  requireRoles("jefe_bodega"),
  inspeccionarItem,
);

module.exports = router;
