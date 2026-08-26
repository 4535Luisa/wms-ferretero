const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  pendientesUbicar,
  ubicarCaja,
  moverCaja,
  moverUbicacion,
  listarMovimientos,
  resolverEscaneado,
} = require("../controllers/ubicaciones.controller");

const MONTACARGUISTA = "montacarguista";
const ADMIN = "administrador";

router.get(
  "/pendientes-ubicar",
  requireRoles(MONTACARGUISTA, ADMIN),
  pendientesUbicar,
);
router.post("/ubicar-caja", requireRoles(MONTACARGUISTA, ADMIN), ubicarCaja);
router.post("/mover-caja", requireRoles(MONTACARGUISTA, ADMIN), moverCaja);
router.post(
  "/mover-ubicacion",
  requireRoles(MONTACARGUISTA, ADMIN),
  moverUbicacion,
);
router.get(
  "/movimientos",
  requireRoles(MONTACARGUISTA, ADMIN),
  listarMovimientos,
);
router.get("/resolver", requireRoles(MONTACARGUISTA, ADMIN), resolverEscaneado);

module.exports = router;
