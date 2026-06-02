import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const sesionId = localStorage.getItem("sesion_id");
  if (sesionId) {
    config.headers["X-Session-Id"] = sesionId;
  }
  return config;
});

// Sesión inválida/expirada o cerrada en otro dispositivo (401): emite un evento
// para que AuthContext cierre la sesión y la app redirija a login. Se ignora el
// propio login (un 401 ahí es "credenciales inválidas", no expiración).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    if (status === 401 && !url.includes("/api/auth/login")) {
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  },
);

export default api;
