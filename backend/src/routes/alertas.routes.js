const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const { requireRoles } = authMiddleware;
const {
  verificarPedidosDemorados,
  listarAlertas,
  marcarAlertaLeida,
  registrarErrorEscaneo,
  reporteErroresEscaneo,
} = require("../controllers/alertas.controller");

const ADMIN = "administrador";
const GERENTE = "gerente_logistico";

router.get(
  "/pedidos-demorados",
  requireRoles(ADMIN),
  verificarPedidosDemorados,
);
router.get("/", requireRoles(ADMIN, GERENTE), listarAlertas);
router.patch("/:id", requireRoles(ADMIN), marcarAlertaLeida);
router.post("/errores-escaneo", registrarErrorEscaneo);
router.get(
  "/errores-escaneo/reporte",
  requireRoles(ADMIN, GERENTE),
  reporteErroresEscaneo,
);

module.exports = router;
