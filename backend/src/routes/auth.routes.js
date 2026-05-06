const express = require("express");
const router = express.Router();
const {
  login,
  logout,
  crearUsuarios,
} = require("../controllers/auth.controller");

router.post("/login", login);
router.post("/logout", logout);
router.post("/crear-usuarios", crearUsuarios);

module.exports = router;
