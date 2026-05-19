const express = require("express");
const router = express.Router();
const {
  generarListasPicking,
  listarListasPicking,
  asignarMontacarguista,
  misListas,
  bajarCaja,
} = require("../controllers/picking.controller");

router.post("/generar", generarListasPicking);
router.get("/", listarListasPicking);
router.get("/mis-listas", misListas);
router.patch("/:id/asignar", asignarMontacarguista);
router.patch("/items/:id/bajar", bajarCaja);

module.exports = router;
