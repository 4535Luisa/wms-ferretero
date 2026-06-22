import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const modulos = [
  {
    path: "/jefe-bodega/recepcion",
    icon: "📥",
    titulo: "Recepciones",
    descripcion: "Registrar mercancía que llega a bodega",
    activo: true,
    fase: null,
  },
  {
    path: "/jefe-bodega/verificacion",
    icon: "✅",
    titulo: "Verificación",
    descripcion: "Verificar pedidos antes de despachar",
    activo: true,
    fase: null,
  },
  {
    path: "/jefe-bodega/despacho",
    icon: "🚚",
    titulo: "Despacho",
    descripcion: "Registrar salida de pedidos",
    activo: true,
    fase: null,
  },
  {
    path: "/jefe-bodega/devoluciones",
    icon: "↩",
    titulo: "Devoluciones",
    descripcion: "Registrar devoluciones de cliente y proveedor",
    activo: true,
    fase: null,
  },
  {
    path: null,
    icon: "📊",
    titulo: "Reportes",
    descripcion: "Historial y estadísticas de bodega",
    activo: false,
    fase: "Fase 6",
  },
];

export default function JefeBodega() {
  const navigate = useNavigate();

  return (
    <Layout
      titulo="Panel Jefe de Bodega"
      subtitulo="Selecciona un módulo para continuar"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {modulos.map((mod) => (
          <div
            key={mod.titulo}
            onClick={() => mod.activo && mod.path && navigate(mod.path)}
            style={{
              background: "#FFFFFF",
              border: mod.activo ? "1px solid #E8E8E8" : "1px solid #F0F0F0",
              borderRadius: "12px",
              padding: "1.5rem",
              cursor: mod.activo ? "pointer" : "default",
              opacity: mod.activo ? 1 : 0.5,
              transition: "all 0.15s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (mod.activo) {
                e.currentTarget.style.borderColor = "#00FF87";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgba(0,255,135,0.08)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = mod.activo
                ? "#E8E8E8"
                : "#F0F0F0";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {mod.fase && (
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  background: "#F0F0F0",
                  color: "#888",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "20px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {mod.fase}
              </div>
            )}
            <div style={{ fontSize: "32px", marginBottom: "1rem" }}>
              {mod.icon}
            </div>
            <div
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                letterSpacing: "0.04em",
                color: "#0A0A0A",
                marginBottom: "6px",
              }}
            >
              {mod.titulo}
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#888",
                lineHeight: 1.5,
              }}
            >
              {mod.descripcion}
            </div>
            {mod.activo && (
              <div
                style={{
                  marginTop: "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#00CC6A",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Abrir <span>→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
