import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Operario() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "500", margin: 0 }}>
            Panel Operario
          </h1>
          <p style={{ fontSize: "13px", color: "#888", margin: "4px 0 0" }}>
            Bienvenido, {usuario?.nombre}
          </p>
        </div>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </div>
      <p style={{ color: "#888", fontSize: "14px" }}>
        Dashboard en construcción — Fase 3
      </p>
    </div>
  );
}
