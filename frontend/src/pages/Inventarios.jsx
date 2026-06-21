import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const TIPOS = [
  { id: "averia", label: "Avería" },
  { id: "perdida", label: "Pérdida" },
  { id: "sobrante", label: "Sobrante" },
  { id: "error", label: "Error" },
  { id: "merma", label: "Merma" },
  { id: "correccion", label: "Corrección" },
];

const estadoColor = {
  pendiente: { bg: "#FEF9C3", fg: "#854D0E" },
  aprobado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  rechazado: { bg: "#FEE2E2", fg: "#991B1B" },
};

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
  mono: { fontFamily: "DM Mono, monospace" },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "Outfit, sans-serif",
    boxSizing: "border-box",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#555",
    display: "block",
    marginBottom: "4px",
  },
};

export default function Inventarios() {
  const [bodegas, setBodegas] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  // Formulario.
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [producto, setProducto] = useState(null);
  const [bodegaId, setBodegaId] = useState("");
  const [tipo, setTipo] = useState("averia");
  const [sentido, setSentido] = useState("decremento");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const [b, a] = await Promise.all([
        api.get("/api/usuarios/bodegas"),
        api.get("/api/ajustes"),
      ]);
      setBodegas(b.data || []);
      setAjustes(a.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const buscar = async (term) => {
    setBusqueda(term);
    setProducto(null);
    if (term.trim().length < 2) {
      setResultados([]);
      return;
    }
    try {
      const { data } = await api.get(
        `/api/productos?buscar=${encodeURIComponent(term.trim())}&limit=8`,
      );
      setResultados(data || []);
    } catch {
      setResultados([]);
    }
  };

  const seleccionar = (p) => {
    setProducto(p);
    setBusqueda(`${p.codigo_interno} — ${p.descripcion_corta}`);
    setResultados([]);
  };

  const limpiar = () => {
    setProducto(null);
    setBusqueda("");
    setResultados([]);
    setBodegaId("");
    setTipo("averia");
    setSentido("decremento");
    setCantidad("");
    setMotivo("");
  };

  const enviar = async () => {
    if (!producto) return aviso("Selecciona un producto", "error");
    if (!bodegaId) return aviso("Selecciona una bodega", "error");
    if (!cantidad || Number(cantidad) <= 0)
      return aviso("La cantidad debe ser mayor a 0", "error");
    if (!motivo.trim()) return aviso("El motivo es obligatorio", "error");

    setCargando(true);
    try {
      await api.post("/api/ajustes", {
        producto_id: producto.id,
        bodega_id: bodegaId,
        tipo,
        sentido,
        cantidad: Number(cantidad),
        motivo: motivo.trim(),
      });
      aviso("✓ Ajuste registrado — pendiente de aprobación del gerente");
      limpiar();
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al registrar el ajuste", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout titulo="Inventarios" subtitulo="Ajustes de inventario">
      {mensaje.texto && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            fontSize: "13px",
            fontWeight: 500,
            background:
              mensaje.tipo === "error" ? "#FEE2E2" : "rgba(0,255,135,0.1)",
            color: mensaje.tipo === "error" ? "#991B1B" : "#007A40",
            border: `1px solid ${mensaje.tipo === "error" ? "#FECACA" : "rgba(0,255,135,0.2)"}`,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      <div style={{ ...C.card, maxWidth: "640px", marginBottom: "2rem" }}>
        <h3
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "20px",
            letterSpacing: "0.04em",
            margin: "0 0 1rem",
          }}
        >
          Nuevo ajuste
        </h3>

        {/* Producto */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <label style={C.label}>Producto *</label>
          <input
            style={C.input}
            value={busqueda}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Busca por referencia o descripción"
          />
          {resultados.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "#FFF",
                border: "1px solid #E8E8E8",
                borderRadius: "8px",
                marginTop: "4px",
                zIndex: 20,
                maxHeight: "220px",
                overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => seleccionar(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #F5F5F5",
                    background: "#FFF",
                    cursor: "pointer",
                    fontFamily: "Outfit, sans-serif",
                  }}
                >
                  <span style={{ ...C.mono, fontSize: "12px", fontWeight: 700 }}>
                    {p.codigo_interno}
                  </span>
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    {" "}
                    — {p.descripcion_corta}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bodega */}
        <div style={{ marginBottom: "12px" }}>
          <label style={C.label}>Bodega *</label>
          <select
            style={C.input}
            value={bodegaId}
            onChange={(e) => setBodegaId(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} — {b.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo + Sentido */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <div>
            <label style={C.label}>Tipo *</label>
            <select
              style={C.input}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={C.label}>Sentido *</label>
            <select
              style={C.input}
              value={sentido}
              onChange={(e) => setSentido(e.target.value)}
            >
              <option value="decremento">Restar (−)</option>
              <option value="incremento">Sumar (+)</option>
            </select>
          </div>
        </div>

        {/* Cantidad */}
        <div style={{ marginBottom: "12px" }}>
          <label style={C.label}>Cantidad *</label>
          <input
            type="number"
            min="1"
            style={C.input}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Unidades a ajustar"
          />
        </div>

        {/* Motivo */}
        <div style={{ marginBottom: "16px" }}>
          <label style={C.label}>Motivo *</label>
          <input
            style={C.input}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe la razón del ajuste"
          />
        </div>

        <button
          onClick={enviar}
          disabled={cargando}
          style={{
            width: "100%",
            background: "#00FF87",
            color: "#0A0A0A",
            border: "none",
            borderRadius: "10px",
            padding: "13px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: cargando ? "not-allowed" : "pointer",
            fontFamily: "Outfit, sans-serif",
            opacity: cargando ? 0.6 : 1,
          }}
        >
          Registrar ajuste
        </button>
      </div>

      <h3
        style={{
          fontSize: "13px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#666",
          marginBottom: "0.75rem",
        }}
      >
        Historial de ajustes
      </h3>
      {ajustes.length === 0 ? (
        <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
          Aún no hay ajustes registrados
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ajustes.map((a) => {
            const ec = estadoColor[a.estado] || estadoColor.pendiente;
            return (
              <div
                key={a.id}
                style={{
                  ...C.card,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {a.productos?.descripcion_corta || "—"}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "12px",
                      color: "#888",
                      marginTop: "3px",
                    }}
                  >
                    {a.productos?.codigo_interno} · {a.bodegas?.codigo} ·{" "}
                    {a.tipo} {a.sentido === "incremento" ? "+" : "−"}
                    {a.cantidad}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>
                    {a.motivo}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background: ec.bg,
                    color: ec.fg,
                    borderRadius: "20px",
                    padding: "4px 10px",
                    flexShrink: 0,
                  }}
                >
                  {a.estado}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
