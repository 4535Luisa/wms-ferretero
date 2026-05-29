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

export default api;
