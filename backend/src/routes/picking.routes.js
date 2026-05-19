const express = require("express");
const router = express.Router();
const {
  generarListasPicking,
  listarListasPicking,
  asignarMontacarguista,
} = require("../controllers/picking.controller");

router.post("/generar", generarListasPicking);
router.get("/", listarListasPicking);
router.patch("/:id/asignar", asignarMontacarguista);

module.exports = router;
