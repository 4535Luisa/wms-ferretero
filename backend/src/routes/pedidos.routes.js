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
} = require("../controllers/pedidos.controller");

const JEFE = "jefe_bodega";
const ADMIN = "administrador";

// Carga de CSV y gestión de pedidos — jefe de bodega y admin
router.post("/csv", requireRoles(JEFE, ADMIN), cargarCSV);
router.get(
  "/",
  requireRoles(ADMIN, JEFE, "facturacion", "gerente_logistico"),
  listarPedidos,
);
router.get("/operarios", requireRoles(ADMIN, JEFE), listarOperarios);
router.get("/mis-pedidos", requireRoles("operario"), misPedidosOperario);
router.get(
  "/:id",
  requireRoles(ADMIN, JEFE, "facturacion", "gerente_logistico", "operario"),
  obtenerPedido,
);

// Asignación — jefe de bodega y admin
router.patch("/:id/asignar", requireRoles(JEFE, ADMIN), asignarPedido);
router.patch("/:id/reasignar", requireRoles(JEFE, ADMIN), reasignarPedido);
router.post("/tanda", requireRoles(JEFE, ADMIN), asignarTanda);
router.patch("/:id/prioridad", requireRoles(JEFE, ADMIN), cambiarPrioridad);
router.patch("/:id/reabrir", requireRoles(JEFE, ADMIN), reabrirPedido);

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
