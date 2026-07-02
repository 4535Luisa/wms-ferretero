const express = require("express");
const router = express.Router();
const {
  buscarProducto,
  listarProductos,
  historialProducto,
  inventarioGeneral,
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
router.get(
  "/inventario-general",
  requireRoles(...rolesInventario),
  inventarioGeneral,
);
router.get("/", listarProductos);
router.get("/:id/historial", historialProducto);

module.exports = router;
