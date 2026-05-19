const express = require("express");
const router = express.Router();
const {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
} = require("../controllers/pedidos.controller");

router.post("/csv", cargarCSV);
router.get("/", listarPedidos);
router.get("/operarios", listarOperarios);
router.get("/:id", obtenerPedido);
router.patch("/:id/asignar", asignarPedido);
router.patch("/:id/facturar", facturarPedido);

module.exports = router;
