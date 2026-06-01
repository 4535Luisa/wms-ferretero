const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  asignarTanda,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
  cambiarPrioridad,
  misPedidosOperario,
  actualizarItemOperario,
  cerrarPedido,
  reabrirPedido,
} = require("../controllers/pedidos.controller");

router.post("/csv", requireRoles("administrador"), cargarCSV);
router.get("/", listarPedidos);
router.get("/operarios", listarOperarios);
router.get("/mis-pedidos", requireRoles("operario"), misPedidosOperario);
router.get("/:id", obtenerPedido);
router.patch("/:id/asignar", requireRoles("administrador"), asignarPedido);
router.post("/tanda", requireRoles("administrador"), asignarTanda);
router.patch("/:id/facturar", requireRoles("facturacion"), facturarPedido);
router.patch("/:id/prioridad", requireRoles("administrador"), cambiarPrioridad);
router.patch("/items/:itemId", requireRoles("operario"), actualizarItemOperario);
router.patch("/:id/cerrar", requireRoles("operario"), cerrarPedido);
router.patch("/:id/reabrir", requireRoles("administrador"), reabrirPedido);

module.exports = router;
