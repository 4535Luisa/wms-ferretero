import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminPedidos from "./pages/AdminPedidos";
import Montacarguista from "./pages/Montacarguista";
import Operario from "./pages/Operario";
import Saldos from "./pages/Saldos";
import JefeBodega from "./pages/JefeBodega";
import JefeBodegaRecepcion from "./pages/JefeBodegaRecepcion";
import Gerente from "./pages/Gerente";
import Inventarios from "./pages/Inventarios";
import HistorialProducto from "./pages/HistorialProducto";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin"
            element={
              <PrivateRoute roles={["administrador"]}>
                <Admin />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <PrivateRoute roles={["administrador"]}>
                <AdminUsuarios />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/pedidos"
            element={
              <PrivateRoute roles={["administrador"]}>
                <AdminPedidos />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/historial"
            element={
              <PrivateRoute roles={["administrador"]}>
                <HistorialProducto />
              </PrivateRoute>
            }
          />

          <Route
            path="/montacarguista"
            element={
              <PrivateRoute roles={["montacarguista"]}>
                <Montacarguista />
              </PrivateRoute>
            }
          />
          <Route
            path="/montacarguista/estibas"
            element={
              <PrivateRoute roles={["montacarguista"]}>
                <Montacarguista />
              </PrivateRoute>
            }
          />

          <Route
            path="/operario"
            element={
              <PrivateRoute roles={["operario"]}>
                <Operario />
              </PrivateRoute>
            }
          />

          <Route
            path="/saldos"
            element={
              <PrivateRoute roles={["saldos"]}>
                <Saldos />
              </PrivateRoute>
            }
          />

          <Route
            path="/jefe-bodega"
            element={
              <PrivateRoute roles={["jefe_bodega"]}>
                <JefeBodega />
              </PrivateRoute>
            }
          />
          <Route
            path="/jefe-bodega/recepcion"
            element={
              <PrivateRoute roles={["jefe_bodega"]}>
                <JefeBodegaRecepcion />
              </PrivateRoute>
            }
          />
          <Route
            path="/jefe-bodega/verificacion"
            element={
              <PrivateRoute roles={["jefe_bodega"]}>
                <JefeBodega />
              </PrivateRoute>
            }
          />
          <Route
            path="/jefe-bodega/despacho"
            element={
              <PrivateRoute roles={["jefe_bodega"]}>
                <JefeBodega />
              </PrivateRoute>
            }
          />

          <Route
            path="/gerente"
            element={
              <PrivateRoute roles={["gerente_logistico"]}>
                <Gerente />
              </PrivateRoute>
            }
          />
          <Route
            path="/gerente/inventario"
            element={
              <PrivateRoute roles={["gerente_logistico"]}>
                <Gerente />
              </PrivateRoute>
            }
          />
          <Route
            path="/gerente/ajustes"
            element={
              <PrivateRoute roles={["gerente_logistico"]}>
                <Gerente />
              </PrivateRoute>
            }
          />
          <Route
            path="/gerente/reportes"
            element={
              <PrivateRoute roles={["gerente_logistico"]}>
                <Gerente />
              </PrivateRoute>
            }
          />

          <Route
            path="/inventarios"
            element={
              <PrivateRoute roles={["inventarios"]}>
                <Inventarios />
              </PrivateRoute>
            }
          />
          <Route
            path="/inventarios/conteos"
            element={
              <PrivateRoute roles={["inventarios"]}>
                <Inventarios />
              </PrivateRoute>
            }
          />
          <Route
            path="/inventarios/mini-conteos"
            element={
              <PrivateRoute roles={["inventarios"]}>
                <Inventarios />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
