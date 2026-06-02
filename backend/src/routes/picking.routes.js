const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const {
  generarListasPicking,
  listarListasPicking,
  asignarMontacarguista,
  misListas,
  bajarCaja,
  crearEstiba,
  misEstibas,
  cancelarLista,
} = require("../controllers/picking.controller");

router.post("/generar", requireRoles("administrador"), generarListasPicking);
router.get("/", listarListasPicking);
router.get("/mis-listas", requireRoles("montacarguista"), misListas);
router.get("/estibas", requireRoles("montacarguista"), misEstibas);
router.post("/estibas", requireRoles("montacarguista"), crearEstiba);
router.patch("/:id/asignar", requireRoles("administrador"), asignarMontacarguista);
router.patch(
  "/:id/cancelar",
  requireRoles("administrador", "gerente_logistico"),
  cancelarLista,
);
router.patch("/items/:id/bajar", requireRoles("montacarguista"), bajarCaja);

module.exports = router;
