import { useState, useEffect, useRef, useCallback } from "react";
import api from "../services/api";

const REFRESCO_MS = 20000;

// Tiempo relativo compacto ("ahora", "5m", "2h", "3d").
function hace(fecha) {
  if (!fecha) return "";
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Campana de notificaciones in-app. Hace polling al backend cada 20s, muestra el
// conteo de no leídas y un panel desplegable. Marcar una (o todas) como leídas
// actualiza el estado al instante. `variant` colorea el ícono según el fondo:
// "dark" para la barra superior móvil, "light" para el header de escritorio.
export default function Campana({ variant = "light" }) {
  const [items, setItems] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/api/notificaciones?limit=20");
      setItems(data.notificaciones || []);
      setNoLeidas(data.no_leidas || 0);
    } catch {
      // Silencioso: un fallo de red puntual no debe romper el layout. El
      // interceptor 401 ya gestiona el cierre de sesión por su cuenta.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Cerrar el panel al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  const marcarLeida = async (n) => {
    if (n.leida) return;
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)),
    );
    setNoLeidas((c) => Math.max(0, c - 1));
    try {
      await api.patch(`/api/notificaciones/${n.id}/leida`);
    } catch {
      cargar(); // revertir al estado real si falló
    }
  };

  const marcarTodas = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
    try {
      await api.patch("/api/notificaciones/leer-todas");
    } catch {
      cargar();
    }
  };

  const colorIcono =
    variant === "dark" ? "rgba(255,255,255,0.85)" : "#0A0A0A";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "20px",
          lineHeight: 1,
          color: colorIcono,
          minWidth: "44px",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span>🔔</span>
        {noLeidas > 0 && (
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              minWidth: "18px",
              height: "18px",
              padding: "0 4px",
              borderRadius: "9px",
              background: "#FF4444",
              color: "#FFFFFF",
              fontSize: "11px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 2px rgba(0,0,0,0.15)",
            }}
          >
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "320px",
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "420px",
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            zIndex: 300,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid #F0F0F0",
            }}
          >
            <span
              style={{
                fontFamily: "Bebas Neue,sans-serif",
                fontSize: "18px",
                letterSpacing: "0.04em",
                color: "#0A0A0A",
              }}
            >
              Notificaciones
            </span>
            {noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#007A40",
                  fontSize: "12px",
                  fontWeight: 600,
                  fontFamily: "Outfit,sans-serif",
                }}
              >
                Marcar todas
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto" }}>
            {items.length === 0 && (
              <div
                style={{
                  padding: "24px 14px",
                  textAlign: "center",
                  color: "#999",
                  fontSize: "13px",
                }}
              >
                Sin notificaciones
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => marcarLeida(n)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  gap: "10px",
                  padding: "12px 14px",
                  border: "none",
                  borderBottom: "1px solid #F5F5F5",
                  cursor: n.leida ? "default" : "pointer",
                  background: n.leida ? "#FFFFFF" : "rgba(0,255,135,0.06)",
                  fontFamily: "Outfit,sans-serif",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    marginTop: "5px",
                    flexShrink: 0,
                    background: n.leida ? "transparent" : "#00FF87",
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#0A0A0A",
                    }}
                  >
                    {n.titulo}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "2px",
                    }}
                  >
                    {n.mensaje}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#AAA",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {hace(n.created_at)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
