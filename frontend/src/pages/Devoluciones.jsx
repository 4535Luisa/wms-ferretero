import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import BuscadorProducto from "../components/BuscadorProducto";
import api from "../services/api";

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

const tipoInfo = {
  cliente: { label: "Cliente (reingresa)", bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  proveedor: { label: "Proveedor (descuenta)", bg: "#FEE2E2", fg: "#991B1B" },
};

export default function Devoluciones() {
  const [bodegas, setBodegas] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const [tipo, setTipo] = useState("cliente");
  const [producto, setProducto] = useState(null);
  const [bodegaId, setBodegaId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [referencia, setReferencia] = useState("");

  const aviso = (texto, tipoMsg = "ok") => {
    setMensaje({ texto, tipo: tipoMsg });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const [b, d] = await Promise.all([
        api.get("/api/usuarios/bodegas"),
        api.get("/api/devoluciones"),
      ]);
      setBodegas(b.data || []);
      setDevoluciones(d.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const registrar = async () => {
    if (!producto) return aviso("Selecciona un producto", "error");
    if (!bodegaId) return aviso("Selecciona una bodega", "error");
    if (!cantidad || Number(cantidad) <= 0)
      return aviso("La cantidad debe ser mayor a 0", "error");
    if (!motivo.trim()) return aviso("El motivo es obligatorio", "error");

    setCargando(true);
    try {
      const { data } = await api.post("/api/devoluciones", {
        tipo,
        producto_id: producto.id,
        bodega_id: bodegaId,
        cantidad: Number(cantidad),
        motivo: motivo.trim(),
        referencia_externa: referencia.trim() || undefined,
      });
      aviso(`✓ ${data.mensaje}`);
      setProducto(null);
      setBodegaId("");
      setCantidad("");
      setMotivo("");
      setReferencia("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al registrar la devolución", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout titulo="Devoluciones" subtitulo="Cliente y proveedor">
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
          Nueva devolución
        </h3>

        {/* Tipo */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {Object.entries(tipoInfo).map(([id, info]) => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: `1.5px solid ${tipo === id ? info.fg : "#E8E8E8"}`,
                background: tipo === id ? info.bg : "transparent",
                color: tipo === id ? info.fg : "#888",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Outfit, sans-serif",
              }}
            >
              {info.label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <BuscadorProducto onSelect={setProducto} />
        </div>

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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <div>
            <label style={C.label}>Cantidad *</label>
            <input
              type="number"
              min="1"
              style={C.input}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Unidades"
            />
          </div>
          <div>
            <label style={C.label}>Factura / OC</label>
            <input
              style={C.input}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={C.label}>Motivo *</label>
          <input
            style={C.input}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Razón de la devolución"
          />
        </div>

        <button
          onClick={registrar}
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
          Registrar devolución
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
        Historial de devoluciones
      </h3>
      {devoluciones.length === 0 ? (
        <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
          Aún no hay devoluciones registradas
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {devoluciones.map((d) => {
            const info = tipoInfo[d.tipo] || tipoInfo.cliente;
            return (
              <div
                key={d.id}
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
                    {d.productos?.descripcion_corta || "—"}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "12px",
                      color: "#888",
                      marginTop: "3px",
                    }}
                  >
                    {d.productos?.codigo_interno} · {d.bodegas?.codigo} ·{" "}
                    {d.tipo === "cliente" ? "+" : "−"}
                    {d.cantidad}
                    {d.referencia_externa ? ` · ${d.referencia_externa}` : ""}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>
                    {d.motivo}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background: info.bg,
                    color: info.fg,
                    borderRadius: "20px",
                    padding: "4px 10px",
                    flexShrink: 0,
                  }}
                >
                  {d.tipo}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
