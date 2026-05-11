const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const supabase = require("./utils/supabase");
const authRoutes = require("./routes/auth.routes");
const recepcionRoutes = require("./routes/recepcion.routes");
const productosRoutes = require("./routes/productos.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const pedidosRoutes = require("./routes/pedidos.routes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://wms-macho-backend.onrender.com",
      /\.netlify\.app$/,
    ],
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", proyecto: "WMS Ferretero" });
});

app.get("/test-supabase", async (req, res) => {
  const { error } = await supabase.from("usuarios").select("*").limit(1);
  if (error)
    return res.status(500).json({ error: "Error conectando a Supabase" });
  res.json({ conexion: "ok", mensaje: "Supabase conectado correctamente" });
});

app.use("/api/auth", authRoutes);
app.use("/api/recepciones", recepcionRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/pedidos", pedidosRoutes);

module.exports = app;
