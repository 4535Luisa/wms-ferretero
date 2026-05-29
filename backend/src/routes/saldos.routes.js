const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  colaSaldos,
  confirmarCajaSaldos,
  entregarSaldo,
} = require("../controllers/saldos.controller");

router.get("/", requireRoles("saldos"), colaSaldos);
router.patch(
  "/caja/:itemId/confirmar",
  requireRoles("saldos"),
  confirmarCajaSaldos,
);
router.patch("/:id/entregar", requireRoles("saldos"), entregarSaldo);

module.exports = router;
