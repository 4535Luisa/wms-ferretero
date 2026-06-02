const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const supabase = require("./utils/supabase");
const authRoutes = require("./routes/auth.routes");
const recepcionRoutes = require("./routes/recepcion.routes");
const productosRoutes = require("./routes/productos.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const pedidosRoutes = require("./routes/pedidos.routes");
const authMiddleware = require("./middlewares/auth.middleware");
const pickingRoutes = require("./routes/picking.routes");
const saldosRoutes = require("./routes/saldos.routes");
const { errorHandler, notFoundHandler } = require("./utils/errors");
const { apiLimiter, authLimiter } = require("./middlewares/rateLimit");
const { construirCorsOptions } = require("./utils/cors");

const app = express();

// Detrás de un único proxy (Render/Railway): permite que el rate limit use la
// IP real del cliente en vez de la del proxy.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors(construirCorsOptions()));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", proyecto: "WMS Ferretero" });
});

app.get("/test-supabase", async (req, res) => {
  const { error } = await supabase.from("usuarios").select("*").limit(1);
  if (error)
    return res.status(500).json({ error: "Error conectando a Supabase" });
  res.json({ conexion: "ok", mensaje: "Supabase conectado correctamente" });
});

// Rate limiting: límite estricto en login (anti fuerza bruta) y general en /api.
app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/recepciones", authMiddleware, recepcionRoutes);
app.use("/api/productos", authMiddleware, productosRoutes);
app.use("/api/usuarios", authMiddleware, usuariosRoutes);
app.use("/api/pedidos", authMiddleware, pedidosRoutes);
app.use("/api/picking", authMiddleware, pickingRoutes);
app.use("/api/saldos", authMiddleware, saldosRoutes);

// Rutas no encontradas + manejador de errores global (siempre al final).
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
