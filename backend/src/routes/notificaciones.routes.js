const express = require("express");
const router = express.Router();
const { requireUuidParam } = require("../utils/validate");
const {
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} = require("../controllers/notificaciones.controller");

// Cada usuario autenticado lee y gestiona SUS propias notificaciones; no hay
// restricción por rol (el filtrado por usuario_id lo hace el controlador).
router.get("/", listarNotificaciones);
router.patch("/leer-todas", marcarTodasLeidas);
router.patch("/:id/leida", requireUuidParam("id"), marcarLeida);

module.exports = router;
