const express = require("express");
const router = express.Router();
const {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  obtenerPedido,
  listarOperarios,
} = require("../controllers/pedidos.controller");

router.post("/csv", cargarCSV);
router.get("/", listarPedidos);
router.get("/operarios", listarOperarios);
router.get("/:id", obtenerPedido);
router.patch("/:id/asignar", asignarPedido);

module.exports = router;
