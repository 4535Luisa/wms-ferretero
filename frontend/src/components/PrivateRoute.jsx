import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const rutasPorRol = {
  administrador: [
    "/admin",
    "/admin/usuarios",
    "/admin/pedidos",
    "/admin/reportes",
  ],
  montacarguista: ["/montacarguista", "/montacarguista/estibas"],
  operario: ["/operario"],
  saldos: ["/saldos"],
  jefe_bodega: [
    "/jefe-bodega",
    "/jefe-bodega/recepcion",
    "/jefe-bodega/verificacion",
    "/jefe-bodega/despacho",
  ],
  gerente_logistico: [
    "/gerente",
    "/gerente/inventario",
    "/gerente/ajustes",
    "/gerente/reportes",
  ],
  inventarios: [
    "/inventarios",
    "/inventarios/conteos",
    "/inventarios/mini-conteos",
  ],
};

export default function PrivateRoute({ children, roles }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0A0A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "32px",
            color: "#FFFFFF",
            letterSpacing: "0.06em",
          }}
        >
          MACHO WMS
        </div>
        <div
          style={{
            width: "40px",
            height: "2px",
            background: "#00FF87",
            animation: "pulse 1s ease-in-out infinite",
            borderRadius: "2px",
          }}
        />
        <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    const rutasDelRol = rutasPorRol[usuario.rol] || [];
    const redireccion = rutasDelRol[0] || "/login";
    return <Navigate to={redireccion} replace />;
  }

  return children;
}
