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

router.post("/", requireRoles("administrador"), crearRecepcion);
router.get("/", requireRoles("administrador"), obtenerRecepciones);
router.get("/:id", requireRoles("administrador"), obtenerRecepcion);
router.post("/:id/items", requireRoles("administrador"), agregarItemRecepcion);
router.patch(
  "/:id/confirmar",
  requireRoles("administrador"),
  confirmarRecepcion,
);
router.patch(
  "/:id/confirmar-directo",
  requireRoles("administrador"),
  confirmarRecepcionDirecto,
);
router.patch(
  "/items/:item_id/cantidad",
  requireRoles("administrador"),
  registrarCantidad,
);
router.patch(
  "/items/:item_id/inspeccion",
  requireRoles("administrador"),
  inspeccionarItem,
);

module.exports = router;
