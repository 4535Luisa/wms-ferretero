const express = require("express");
const router = express.Router();
const {
  buscarProducto,
  listarProductos,
} = require("../controllers/productos.controller");

router.get("/buscar", buscarProducto);
router.get("/", listarProductos);

module.exports = router;
