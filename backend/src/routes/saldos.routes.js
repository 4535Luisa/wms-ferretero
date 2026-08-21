const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  listaSaldosPorOperario,
  confirmarCajaSaldos,
  entregarSaldo,
} = require("../controllers/saldos.controller");

router.get("/", requireRoles("saldos"), listaSaldosPorOperario);
router.patch(
  "/caja/:itemId/confirmar",
  requireRoles("saldos"),
  confirmarCajaSaldos,
);
router.patch("/entregar", requireRoles("saldos"), entregarSaldo);

module.exports = router;
