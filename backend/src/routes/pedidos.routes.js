const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  cargarCSV,
  listarPedidos,
  asignarPedido,
  asignarTanda,
  reasignarPedido,
  obtenerPedido,
  listarOperarios,
  facturarPedido,
  cambiarPrioridad,
  misPedidosOperario,
  actualizarItemOperario,
  cerrarPedido,
  reabrirPedido,
  cancelarPedido,
} = require("../controllers/pedidos.controller");

const ADMIN = "administrador";

// Carga de CSV y gestión de pedidos — administrador
router.post("/csv", requireRoles(ADMIN), cargarCSV);
router.get(
  "/",
  requireRoles(ADMIN, "facturacion", "gerente_logistico"),
  listarPedidos,
);
router.get("/operarios", requireRoles(ADMIN), listarOperarios);
router.get("/mis-pedidos", requireRoles("operario"), misPedidosOperario);
router.get(
  "/:id",
  requireRoles(ADMIN, "facturacion", "gerente_logistico", "operario"),
  obtenerPedido,
);

// Asignación — administrador
router.patch("/:id/asignar", requireRoles(ADMIN), asignarPedido);
router.patch("/:id/reasignar", requireRoles(ADMIN), reasignarPedido);
router.post("/tanda", requireRoles(ADMIN), asignarTanda);
router.patch("/:id/prioridad", requireRoles(ADMIN), cambiarPrioridad);
router.patch("/:id/reabrir", requireRoles(ADMIN), reabrirPedido);
router.patch("/:id/cancelar", requireRoles(ADMIN), cancelarPedido);

// Facturación
router.patch("/:id/facturar", requireRoles("facturacion"), facturarPedido);

// Operario
router.patch(
  "/items/:itemId",
  requireRoles("operario"),
  actualizarItemOperario,
);
router.patch("/:id/cerrar", requireRoles("operario"), cerrarPedido);

module.exports = router;
