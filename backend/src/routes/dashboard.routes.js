const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { resumen } = require("../controllers/dashboard.controller");

router.get("/", requireRoles("administrador", "gerente_logistico"), resumen);

module.exports = router;
