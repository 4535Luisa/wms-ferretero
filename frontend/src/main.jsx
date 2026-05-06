import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminUsuarios from "./pages/AdminUsuarios";
import Montacarguista from "./pages/Montacarguista";
import Operario from "./pages/Operario";
import Saldos from "./pages/Saldos";
import JefeBodega from "./pages/JefeBodega";
import JefeBodegaRecepcion from "./pages/JefeBodegaRecepcion";
import Gerente from "./pages/Gerente";
import Inventarios from "./pages/Inventarios";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/usuarios" element={<AdminUsuarios />} />
          <Route path="/montacarguista" element={<Montacarguista />} />
          <Route path="/operario" element={<Operario />} />
          <Route path="/saldos" element={<Saldos />} />
          <Route path="/jefe-bodega" element={<JefeBodega />} />
          <Route
            path="/jefe-bodega/recepcion"
            element={<JefeBodegaRecepcion />}
          />
          <Route path="/gerente" element={<Gerente />} />
          <Route path="/inventarios" element={<Inventarios />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
