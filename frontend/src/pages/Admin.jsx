import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const modulos = [
  {
    path: "/admin/pedidos",
    icon: "📋",
    titulo: "Pedidos",
    descripcion:
      "Cargar CSV, generar listas y asignar a operarios y montacarguistas",
    activo: true,
  },
  {
    path: "/admin/recepcion",
    icon: "📥",
    titulo: "Recepciones",
    descripcion: "Registrar mercancía que llega a bodega con escaneo",
    activo: true,
  },
  {
    path: "/admin/verificacion",
    icon: "✅",
    titulo: "Verificación",
    descripcion: "Verificar pedidos antes de despachar",
    activo: true,
  },
  {
    path: "/admin/despacho",
    icon: "🚚",
    titulo: "Despacho",
    descripcion: "Registrar salida de pedidos con datos del transportista",
    activo: true,
  },
  {
    path: "/admin/devoluciones",
    icon: "↩",
    titulo: "Devoluciones",
    descripcion: "Registrar devoluciones de cliente y proveedor",
    activo: true,
  },
  {
    path: "/admin/usuarios",
    icon: "👷",
    titulo: "Usuarios",
    descripcion: "Crear, editar y desactivar usuarios del sistema",
    activo: true,
  },
  {
    path: "/admin/dashboard",
    icon: "⚡",
    titulo: "Dashboard en vivo",
    descripcion: "Pedidos activos y operarios en tiempo real",
    activo: true,
  },
  {
    path: "/admin/historial",
    icon: "🔍",
    titulo: "Historial",
    descripcion: "Trazabilidad de movimientos por referencia",
    activo: true,
  },
  {
    path: "/inventario",
    icon: "📦",
    titulo: "Inventario",
    descripcion: "Stock actual por referencia, bodega y ubicación",
    activo: true,
  },
];

export default function Admin() {
  const navigate = useNavigate();

  return (
    <Layout
      titulo="Panel Administrador"
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
            onClick={() => mod.activo && navigate(mod.path)}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
              cursor: "pointer",
              transition: "all 0.15s",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#00FF87";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(0,255,135,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#E8E8E8";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
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
            <div style={{ fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
              {mod.descripcion}
            </div>
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
          </div>
        ))}
      </div>
    </Layout>
  );
}
