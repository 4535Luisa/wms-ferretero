import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";

const AuthContext = createContext();

// Lee la sesión guardada de forma segura. Si localStorage está corrupto, lo
// limpia en vez de crashear la app.
function leerSesionGuardada() {
  try {
    const token = localStorage.getItem("token");
    const usuarioGuardado = localStorage.getItem("usuario");
    if (token && usuarioGuardado) return JSON.parse(usuarioGuardado);
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    localStorage.removeItem("sesion_id");
  }
  return null;
}

export const AuthProvider = ({ children }) => {
  // La sesión se resuelve de forma síncrona al montar (init perezoso de
  // useState): no hay carga asíncrona, por eso `cargando` es siempre false.
  const [usuario, setUsuario] = useState(leerSesionGuardada);
  const cargando = false;

  const login = async (email, password) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("usuario", JSON.stringify(data.usuario));
    if (data.sesion_id) localStorage.setItem("sesion_id", data.sesion_id);
    setUsuario(data.usuario);
    return data.usuario;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    localStorage.removeItem("sesion_id");
    setUsuario(null);
  };

  // Cierre de sesión disparado por el interceptor 401 (token expirado o sesión
  // cerrada en otro dispositivo). PrivateRoute redirige a /login al quedar null.
  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cargando }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
