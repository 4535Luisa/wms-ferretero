require("dotenv").config();
const { validarEnv } = require("./utils/env");
const logger = require("./utils/logger");

// Fail-fast: si falta configuración crítica, no se levanta el servidor.
try {
  validarEnv();
} catch (err) {
  logger.error("Configuración de entorno inválida", { detail: err.message });
  process.exit(1);
}

const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info("WMS Ferretero iniciado", { puerto: PORT });
});
