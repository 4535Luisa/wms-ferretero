const express = require("express");
const router = express.Router();
const {
  buscarProducto,
  buscarPorBarras,
  listarProductos,
  historialProducto,
  inventarioGeneral,
  actualizarCodigoBarras,
} = require("../controllers/productos.controller");
const { requireRoles } = require("../middlewares/auth.middleware");

const rolesInventario = [
  "administrador",
  "jefe_bodega",
  "gerente_logistico",
  "inventarios",
  "facturacion",
  "montacarguista",
  "saldos",
];

router.get("/buscar", buscarProducto);
router.get("/buscar-barras", buscarPorBarras);
router.get(
  "/inventario-general",
  requireRoles(...rolesInventario),
  inventarioGeneral,
);
router.get("/", listarProductos);
router.get("/:id/historial", historialProducto);

router.patch(
  "/:id/codigo-barras",
  requireRoles("administrador", "inventarios"),
  actualizarCodigoBarras,
);

module.exports = router;
