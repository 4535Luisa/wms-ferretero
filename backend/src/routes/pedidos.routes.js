const express = require("express");
const router = express.Router();
const {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  asignarTanda,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
  cambiarPrioridad,
} = require("../controllers/pedidos.controller");

router.post("/csv", cargarCSV);
router.get("/", listarPedidos);
router.get("/operarios", listarOperarios);
router.get("/:id", obtenerPedido);
router.patch("/:id/asignar", asignarPedido);
router.post("/tanda", asignarTanda);
router.patch("/:id/facturar", facturarPedido);
router.patch("/:id/prioridad", cambiarPrioridad);

module.exports = router;
