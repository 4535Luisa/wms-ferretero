import { useState } from "react";
import api from "../services/api";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #E8E8E8",
  borderRadius: "8px",
  fontSize: "14px",
  fontFamily: "Outfit, sans-serif",
  boxSizing: "border-box",
};

// Buscador de producto reutilizable: muestra resultados de /api/productos y
// llama onSelect(producto) al elegir (o onSelect(null) al teclear de nuevo).
export default function BuscadorProducto({ onSelect, label = "Producto *" }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);

  const buscar = async (term) => {
    setBusqueda(term);
    onSelect(null);
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

  const elegir = (p) => {
    onSelect(p);
    setBusqueda(`${p.codigo_interno} — ${p.descripcion_corta}`);
    setResultados([]);
  };

  return (
    <div style={{ position: "relative" }}>
      <label
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "#555",
          display: "block",
          marginBottom: "4px",
        }}
      >
        {label}
      </label>
      <input
        style={inputStyle}
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
              onClick={() => elegir(p)}
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
              <span
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
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
  );
}
