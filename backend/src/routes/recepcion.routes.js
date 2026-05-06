const express = require("express");
const router = express.Router();
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

router.post("/", crearRecepcion);
router.get("/", obtenerRecepciones);
router.get("/:id", obtenerRecepcion);
router.post("/:id/items", agregarItemRecepcion);
router.patch("/:id/confirmar", confirmarRecepcion);
router.patch("/:id/confirmar-directo", confirmarRecepcionDirecto);
router.patch("/items/:item_id/cantidad", registrarCantidad);
router.patch("/items/:item_id/inspeccion", inspeccionarItem);

module.exports = router;
