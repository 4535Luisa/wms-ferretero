import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminPedidos from "./pages/AdminPedidos";
import Dashboard from "./pages/Dashboard";
import HistorialProducto from "./pages/HistorialProducto";
import Montacarguista from "./pages/Montacarguista";
import Operario from "./pages/Operario";
import Saldos from "./pages/Saldos";
import JefeBodegaRecepcion from "./pages/JefeBodegaRecepcion";
import Verificacion from "./pages/Verificacion";
import Despacho from "./pages/Despacho";
import Devoluciones from "./pages/Devoluciones";
import Kits from "./pages/Kits";
import Gerente from "./pages/Gerente";
import Inventarios from "./pages/Inventarios";
import Facturacion from "./pages/Facturacion";
import InventarioGeneral from "./pages/InventarioGeneral";

const ADMIN = ["administrador"];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* ── Administrador ── */}
          <Route
            path="/admin"
            element={
              <PrivateRoute roles={ADMIN}>
                <Admin />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <PrivateRoute roles={ADMIN}>
                <AdminUsuarios />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/pedidos"
            element={
              <PrivateRoute roles={ADMIN}>
                <AdminPedidos />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <PrivateRoute roles={ADMIN}>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/historial"
            element={
              <PrivateRoute roles={ADMIN}>
                <HistorialProducto />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/recepcion"
            element={
              <PrivateRoute roles={ADMIN}>
                <JefeBodegaRecepcion />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/verificacion"
            element={
              <PrivateRoute roles={ADMIN}>
                <Verificacion />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/despacho"
            element={
              <PrivateRoute roles={ADMIN}>
                <Despacho />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/devoluciones"
            element={
              <PrivateRoute roles={ADMIN}>
                <Devoluciones />
              </PrivateRoute>
            }
          />

          {/* ── Montacarguista ── */}
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

          {/* ── Operario ── */}
          <Route
            path="/operario"
            element={
              <PrivateRoute roles={["operario"]}>
                <Operario />
              </PrivateRoute>
            }
          />

          {/* ── Saldos ── */}
          <Route
            path="/saldos"
            element={
              <PrivateRoute roles={["saldos"]}>
                <Saldos />
              </PrivateRoute>
            }
          />

          {/* ── Gerente logístico ── */}
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

          {/* ── Kits ── */}
          <Route
            path="/kits"
            element={
              <PrivateRoute roles={["inventarios", "gerente_logistico"]}>
                <Kits />
              </PrivateRoute>
            }
          />

          {/* ── Inventarios ── */}
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

          {/* ── Facturación ── */}
          <Route
            path="/facturacion"
            element={
              <PrivateRoute roles={["facturacion"]}>
                <Facturacion />
              </PrivateRoute>
            }
          />
          <Route
            path="/facturacion/historial"
            element={
              <PrivateRoute roles={["facturacion"]}>
                <Facturacion />
              </PrivateRoute>
            }
          />

          {/* ── Inventario general (todos excepto operario) ── */}
          <Route
            path="/inventario"
            element={
              <PrivateRoute
                roles={[
                  "administrador",
                  "gerente_logistico",
                  "inventarios",
                  "facturacion",
                  "montacarguista",
                  "saldos",
                ]}
              >
                <InventarioGeneral />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
