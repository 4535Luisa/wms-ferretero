import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

const menuPorRol = {
  administrador: [
    { path: "/admin", label: "Dashboard", icon: "◼" },
    { path: "/admin/usuarios", label: "Usuarios", icon: "👷" },
    { path: "/admin/pedidos", label: "Pedidos", icon: "📋" },
    { path: "/admin/historial", label: "Historial", icon: "🔍" },
    { path: "/admin/reportes", label: "Reportes", icon: "📊" },
  ],
  montacarguista: [
    { path: "/montacarguista", label: "Mis pedidos", icon: "◼" },
    { path: "/montacarguista/estibas", label: "Estibas", icon: "📦" },
  ],
  operario: [{ path: "/operario", label: "Mis pedidos", icon: "◼" }],
  saldos: [{ path: "/saldos", label: "Cola de saldos", icon: "◼" }],
  jefe_bodega: [
    { path: "/jefe-bodega", label: "Panel", icon: "◼" },
    { path: "/jefe-bodega/recepcion", label: "Recepciones", icon: "📥" },
    { path: "/jefe-bodega/verificacion", label: "Verificación", icon: "✅" },
    { path: "/jefe-bodega/despacho", label: "Despacho", icon: "🚚" },
  ],
  gerente_logistico: [
    { path: "/gerente", label: "Dashboard", icon: "◼" },
    { path: "/gerente/inventario", label: "Inventario", icon: "📦" },
    { path: "/gerente/ajustes", label: "Ajustes", icon: "⚙" },
    { path: "/gerente/reportes", label: "Reportes", icon: "📊" },
  ],
  inventarios: [
    { path: "/inventarios", label: "Panel", icon: "◼" },
    { path: "/inventarios/conteos", label: "Conteos", icon: "🔢" },
    { path: "/inventarios/mini-conteos", label: "Mini-conteos", icon: "⚡" },
  ],
};

const labelRol = {
  administrador: "Administrador",
  montacarguista: "Montacarguista",
  operario: "Operario",
  saldos: "Saldos",
  jefe_bodega: "Jefe de Bodega",
  gerente_logistico: "Gerente Logístico",
  inventarios: "Inventarios",
};

export default function Layout({ children, titulo, subtitulo }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menu = menuPorRol[usuario?.rol] || [];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleNav = (path) => {
    navigate(path);
    setMenuAbierto(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

        .wms-layout {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 220px 1fr;
          grid-template-rows: 64px 1fr;
          background: #F0F0F0;
          font-family: 'Outfit', sans-serif;
        }

        .wms-sidebar {
          grid-row: 1 / 3;
          background: #0A0A0A;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .wms-header {
          background: #FFFFFF;
          border-bottom: 1px solid #E8E8E8;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .wms-content {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .wms-mobile-title {
          display: none;
          margin-bottom: 1rem;
        }

        .wms-topbar {
          display: none;
          background: #0A0A0A;
          padding: 0 1rem;
          height: 56px;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .wms-bottomnav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #0A0A0A;
          border-top: 1px solid rgba(255,255,255,0.08);
          z-index: 100;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .wms-mobile-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 200;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s;
        }

        .wms-mobile-overlay.open {
          opacity: 1;
          pointer-events: all;
        }

        .wms-mobile-menu {
          position: fixed;
          top: 0;
          left: -280px;
          width: 280px;
          height: 100vh;
          background: #0A0A0A;
          z-index: 210;
          transition: left 0.25s ease;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .wms-mobile-menu.open {
          left: 0;
        }

        .wms-nav-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 8px 4px;
          flex: 1;
          background: transparent;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.4);
          font-family: 'Outfit', sans-serif;
          font-size: 10px;
          font-weight: 500;
          min-height: 56px;
          transition: color 0.15s;
          border-radius: 0;
        }

        .wms-nav-btn.active {
          color: #00FF87;
        }

        .wms-nav-btn .icon {
          font-size: 20px;
          line-height: 1;
        }

        .wms-sidebar-nav-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 8px;
          margin-bottom: 2px;
          background: transparent;
          color: rgba(255,255,255,0.45);
          border: 1px solid transparent;
          font-size: 13px;
          font-weight: 400;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
          min-height: 44px;
        }

        .wms-sidebar-nav-btn.active {
          background: rgba(0,255,135,0.1);
          color: #00FF87;
          border-color: rgba(0,255,135,0.2);
          font-weight: 600;
        }

        .wms-sidebar-nav-btn:hover:not(.active) {
          color: rgba(255,255,255,0.8);
        }

        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,255,135,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,135,0.03) 1px, transparent 1px);
          background-size: 30px 30px;
          pointer-events: none;
        }

        .hamburger-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
        }

        .hamburger-btn span {
          display: block;
          width: 22px;
          height: 2px;
          background: #FFFFFF;
          border-radius: 2px;
        }

        @media (max-width: 768px) {
          .wms-layout {
            grid-template-columns: 1fr;
            grid-template-rows: 56px 1fr;
          }
          .wms-sidebar { display: none; }
          .wms-topbar { display: flex; }
          .wms-header { display: none; }
          .wms-mobile-title { display: block; }
          .wms-content {
            padding: 1rem;
            padding-bottom: calc(56px + env(safe-area-inset-bottom) + 1rem);
          }
          .wms-bottomnav {
            display: flex;
            align-items: stretch;
            height: calc(56px + env(safe-area-inset-bottom));
          }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          .wms-layout {
            grid-template-columns: 72px 1fr;
          }
          .wms-sidebar-label { display: none; }
          .wms-sidebar-nav-btn {
            justify-content: center;
            padding: 11px 8px;
          }
          .wms-logo-text { display: none; }
          .wms-user-name { display: none; }
        }
      `}</style>

      <div className="wms-layout">
        {/* TOPBAR — solo móvil */}
        <div className="wms-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              className="hamburger-btn"
              onClick={() => setMenuAbierto(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <div
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                color: "#FFFFFF",
                letterSpacing: "0.06em",
                lineHeight: 1,
              }}
            >
              MACHO WMS
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(0,255,135,0.08)",
              border: "1px solid rgba(0,255,135,0.15)",
              borderRadius: "6px",
              padding: "4px 10px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#00FF87",
                boxShadow: "0 0 6px #00FF87",
              }}
            />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#00CC6A",
                letterSpacing: "0.06em",
              }}
            >
              EN LÍNEA
            </span>
          </div>
        </div>

        {/* SIDEBAR — escritorio */}
        <div className="wms-sidebar">
          <div className="grid-bg" />

          <div
            style={{
              padding: "1.5rem 1.25rem",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <div className="wms-logo-text">
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "26px",
                  color: "#FFFFFF",
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                }}
              >
                MACHO
              </div>
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "13px",
                  color: "#00FF87",
                  letterSpacing: "0.2em",
                }}
              >
                WMS
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "#00FF87",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "16px",
                  color: "#0A0A0A",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {usuario?.nombre?.charAt(0) || "U"}
              </div>
              <div className="wms-user-name" style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#FFFFFF",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {usuario?.nombre}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {labelRol[usuario?.rol]}
                </div>
              </div>
            </div>
          </div>

          <nav
            style={{ flex: 1, padding: "1rem 0.75rem", position: "relative" }}
          >
            {menu.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`wms-sidebar-nav-btn${location.pathname === item.path ? " active" : ""}`}
              >
                <span style={{ fontSize: "16px", flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span className="wms-sidebar-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div
            style={{
              padding: "1rem 0.75rem",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <button
              onClick={handleLogout}
              className="wms-sidebar-nav-btn"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#FF4444";
                e.currentTarget.style.background = "rgba(255,68,68,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,0.3)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span>⎋</span>
              <span className="wms-sidebar-label">Cerrar sesión</span>
            </button>
          </div>
        </div>

        {/* HEADER — escritorio */}
        <div className="wms-header">
          <div>
            <h1
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "26px",
                letterSpacing: "0.04em",
                color: "#0A0A0A",
                lineHeight: 1,
              }}
            >
              {titulo}
            </h1>
            {subtitulo && (
              <p style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>
                {subtitulo}
              </p>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0,255,135,0.06)",
              border: "1px solid rgba(0,255,135,0.15)",
              borderRadius: "8px",
              padding: "6px 12px",
            }}
          >
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#00FF87",
                boxShadow: "0 0 6px #00FF87",
              }}
            />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#007A40",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              En línea
            </span>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="wms-content">
          <div className="wms-mobile-title">
            <h1
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "24px",
                letterSpacing: "0.04em",
                color: "#0A0A0A",
                lineHeight: 1,
              }}
            >
              {titulo}
            </h1>
            {subtitulo && (
              <p style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>
                {subtitulo}
              </p>
            )}
          </div>
          {children}
        </div>

        {/* BOTTOM NAV — solo móvil */}
        <div className="wms-bottomnav">
          {menu.slice(0, 4).map((item) => (
            <button
              key={item.path}
              className={`wms-nav-btn${location.pathname === item.path ? " active" : ""}`}
              onClick={() => handleNav(item.path)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <button className="wms-nav-btn" onClick={handleLogout}>
            <span className="icon">⎋</span>
            <span>Salir</span>
          </button>
        </div>

        {/* OVERLAY MÓVIL */}
        <div
          className={`wms-mobile-overlay${menuAbierto ? " open" : ""}`}
          onClick={() => setMenuAbierto(false)}
        />

        {/* MENÚ LATERAL MÓVIL */}
        <div className={`wms-mobile-menu${menuAbierto ? " open" : ""}`}>
          <div className="grid-bg" />
          <div
            style={{
              padding: "1.25rem",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "24px",
                  color: "#FFFFFF",
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                }}
              >
                MACHO WMS
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: "2px",
                }}
              >
                {labelRol[usuario?.rol]}
              </div>
            </div>
            <button
              onClick={() => setMenuAbierto(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                fontSize: "24px",
                cursor: "pointer",
                padding: "4px",
                lineHeight: 1,
                minHeight: "44px",
                minWidth: "44px",
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#00FF87",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "18px",
                color: "#0A0A0A",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {usuario?.nombre?.charAt(0) || "U"}
            </div>
            <div>
              <div
                style={{ fontSize: "14px", fontWeight: 600, color: "#FFFFFF" }}
              >
                {usuario?.nombre}
              </div>
              <div style={{ fontSize: "11px", color: "#00FF87" }}>
                {labelRol[usuario?.rol]}
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: "1rem", position: "relative" }}>
            {menu.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`wms-sidebar-nav-btn${location.pathname === item.path ? " active" : ""}`}
              >
                <span style={{ fontSize: "18px", flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div
            style={{
              padding: "1rem",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <button
              onClick={handleLogout}
              className="wms-sidebar-nav-btn"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              <span>⎋</span> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
