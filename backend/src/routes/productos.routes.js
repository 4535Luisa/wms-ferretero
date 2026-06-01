const express = require("express");
const router = express.Router();
const {
  buscarProducto,
  listarProductos,
  historialProducto,
} = require("../controllers/productos.controller");

router.get("/buscar", buscarProducto);
router.get("/", listarProductos);
router.get("/:id/historial", historialProducto);

module.exports = router;
