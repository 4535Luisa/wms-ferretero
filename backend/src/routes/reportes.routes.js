const express = require("express");
const router = express.Router();
const { requireRoles } = require("../middlewares/auth.middleware");
const { kpis } = require("../controllers/reportes.controller");

router.get("/kpis", requireRoles("gerente_logistico"), kpis);

module.exports = router;
