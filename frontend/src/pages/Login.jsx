import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    try {
      const usuario = await login(email, password);
      switch (usuario.rol) {
        case "administrador":
          navigate("/admin");
          break;
        case "montacarguista":
          navigate("/montacarguista");
          break;
        case "operario":
          navigate("/operario");
          break;
        case "saldos":
          navigate("/saldos");
          break;
        case "jefe_bodega":
          navigate("/jefe-bodega");
          break;
        case "gerente_logistico":
          navigate("/gerente");
          break;
        case "inventarios":
          navigate("/inventarios");
          break;
        case "facturacion":
          navigate("/facturacion");
          break;
        default:
          navigate("/");
      }
    } catch {
      setError("Email o contraseña incorrectos");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 440px",
        background: "#0A0A0A",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      {/* Panel izquierdo */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "3rem 4rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid de fondo */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
            linear-gradient(rgba(0,255,135,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,135,0.04) 1px, transparent 1px)
          `,
            backgroundSize: "60px 60px",
            pointerEvents: "none",
          }}
        />

        {/* Glow verde */}
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,255,135,0.06) 0%, transparent 70%)",
            bottom: "-100px",
            left: "-100px",
            pointerEvents: "none",
          }}
        />

        {/* Logo top */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "8px 16px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#00FF87",
                boxShadow: "0 0 8px #00FF87",
              }}
            />
            <span
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "12px",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Sistema activo
            </span>
          </div>
        </div>

        {/* Título central */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              fontSize: "13px",
              color: "#00FF87",
              fontWeight: 600,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: "1.5rem",
            }}
          >
            Warehouse Management System
          </div>

          <div
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "110px",
              lineHeight: 0.85,
              letterSpacing: "0.02em",
              color: "#FFFFFF",
              marginBottom: "0.5rem",
            }}
          >
            MACHO
          </div>
          <div
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "110px",
              lineHeight: 0.85,
              letterSpacing: "0.02em",
              color: "#00FF87",
              textShadow: "0 0 40px rgba(0,255,135,0.4)",
              marginBottom: "2.5rem",
            }}
          >
            WMS
          </div>

          <p
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "15px",
              maxWidth: "360px",
              lineHeight: 1.7,
              fontWeight: 300,
            }}
          >
            Control total de recepción, inventario, picking y despacho para las
            bodegas de Indurruedas.
          </p>
        </div>

        {/* Stats bottom */}
        <div
          style={{
            display: "flex",
            gap: "3rem",
            position: "relative",
          }}
        >
          {[
            { num: "3", label: "Bodegas" },
            { num: "1.224", label: "Referencias" },
            { num: "476", label: "Ubicaciones activas" },
          ].map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "40px",
                  color: "#FFFFFF",
                  lineHeight: 1,
                  letterSpacing: "0.04em",
                }}
              >
                {stat.num}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.25)",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: "4px",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div
        style={{
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3.5rem",
          position: "relative",
        }}
      >
        {/* Barra verde top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #00FF87, #00CC6A)",
          }}
        />

        <div style={{ marginBottom: "2.5rem" }}>
          <h2
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "42px",
              letterSpacing: "0.04em",
              color: "#0A0A0A",
              lineHeight: 1,
              marginBottom: "8px",
            }}
          >
            Bienvenido
          </h2>
          <p
            style={{
              color: "#888",
              fontSize: "14px",
              fontWeight: 400,
            }}
          >
            Ingresa con tu cuenta de trabajo
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "#fff5f5",
              color: "#c0392b",
              padding: "12px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "1.5rem",
              borderLeft: "3px solid #FF4444",
              fontWeight: 500,
            }}
          >
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#999",
                display: "block",
                marginBottom: "8px",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@indurruedas.com"
              required
              style={{ fontSize: "14px" }}
            />
          </div>

          <div style={{ marginBottom: "2rem" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#999",
                display: "block",
                marginBottom: "8px",
              }}
            >
              Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  fontSize: "14px",
                  paddingRight: "48px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  color: "#888",
                  fontSize: "16px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showPassword ? "👤" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "15px",
              fontWeight: 700,
              background: cargando ? "#ccc" : "#0A0A0A",
              color: "#FFFFFF",
              borderRadius: "8px",
              letterSpacing: "0.05em",
              border: "none",
              cursor: cargando ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!cargando) e.target.style.background = "#00FF87";
              e.target.style.color = "#0A0A0A";
            }}
            onMouseLeave={(e) => {
              if (!cargando) e.target.style.background = "#0A0A0A";
              e.target.style.color = "#FFFFFF";
            }}
          >
            {cargando ? "Verificando..." : "Ingresar →"}
          </button>
        </form>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "2rem",
            left: "3.5rem",
            right: "3.5rem",
          }}
        >
          <div
            style={{
              height: "1px",
              background: "#F0F0F0",
              marginBottom: "1.25rem",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#0A0A0A",
                }}
              >
                INDURRUEDAS S.A.
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#BBB",
                  fontFamily: "DM Mono, monospace",
                }}
              >
                NIT 890.207.956-1
              </div>
            </div>
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "#0A0A0A",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
              }}
            >
              🔧
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
