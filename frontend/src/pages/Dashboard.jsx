import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
};

// Etiquetas legibles para los estados crudos de la BD.
const ESTADO_LABEL = {
  pendiente: "Pendiente",
  asignado: "Asignado",
  en_proceso: "En proceso",
  en_picking: "En picking",
  cerrado: "Cerrado",
  despachado: "Despachado",
  asignada: "Asignada",
  completada: "Completada",
  cancelada: "Cancelada",
};
const etiqueta = (e) => ESTADO_LABEL[e] || e;

const REFRESCO_MS = 15000;

function StatCard({ label, valor, sub, color }) {
  return (
    <div style={C.card}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#888",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: "40px",
          lineHeight: 1.1,
          marginTop: "6px",
          color: color || "#0A0A0A",
        }}
      >
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ListaEstados({ titulo, datos }) {
  const entradas = Object.entries(datos || {});
  return (
    <div style={C.card}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#888",
          marginBottom: "12px",
        }}
      >
        {titulo}
      </div>
      {entradas.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#BBB" }}>Sin datos</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {entradas.map(([estado, n]) => (
            <div
              key={estado}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
                paddingBottom: "6px",
                borderBottom: "1px solid #F5F5F5",
              }}
            >
              <span style={{ color: "#555" }}>{etiqueta(estado)}</span>
              <span style={{ fontWeight: 700, color: "#0A0A0A" }}>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [hace, setHace] = useState(0);
  const ultimaCarga = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dashboard");
      setData(data);
      setError(false);
      ultimaCarga.current = Date.now();
      setHace(0);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Contador "actualizado hace Ns".
  useEffect(() => {
    const id = setInterval(() => {
      if (ultimaCarga.current == null) return;
      setHace(Math.round((Date.now() - ultimaCarga.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const pedidos = data?.pedidos;
  const picking = data?.picking;
  const saldos = data?.saldos;

  return (
    <Layout
      titulo="Dashboard en vivo"
      subtitulo={
        error
          ? "Sin conexión — reintentando…"
          : `Se actualiza cada ${REFRESCO_MS / 1000}s · actualizado hace ${hace}s`
      }
    >
      <div style={{ marginBottom: "1.25rem" }}>
        <button
          onClick={cargar}
          style={{
            background: "transparent",
            color: "#0A0A0A",
            border: "1.5px solid #E8E8E8",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Outfit, sans-serif",
          }}
        >
          ↻ Actualizar ahora
        </button>
      </div>

      {!data ? (
        <div style={{ ...C.card, textAlign: "center", color: "#BBB" }}>
          Cargando…
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          {/* Stat cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
            }}
          >
            <StatCard
              label="Pedidos totales"
              valor={pedidos?.total ?? 0}
              sub={`${pedidos?.por_estado?.pendiente || 0} sin asignar`}
            />
            <StatCard
              label="Urgentes activos"
              valor={pedidos?.urgentes_activos ?? 0}
              color={pedidos?.urgentes_activos ? "#B91C1C" : "#0A0A0A"}
            />
            <StatCard
              label="Progreso picking"
              valor={`${picking?.progreso_pct ?? 0}%`}
              sub={`${picking?.cajas_bajadas || 0}/${picking?.cajas_total || 0} cajas`}
              color="#00CC6A"
            />
            <StatCard
              label="Saldos en cola"
              valor={saldos?.en_cola ?? 0}
              sub={`${saldos?.cajas_por_confirmar || 0} cajas por confirmar`}
            />
          </div>

          {/* Desgloses */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            <ListaEstados
              titulo="Pedidos por estado"
              datos={pedidos?.por_estado}
            />
            <ListaEstados
              titulo="Listas de picking por estado"
              datos={picking?.listas_por_estado}
            />

            <div style={C.card}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#888",
                  marginBottom: "12px",
                }}
              >
                Carga por operario (pedidos activos)
              </div>
              {(!data.operarios_carga ||
                data.operarios_carga.length === 0) ? (
                <div style={{ fontSize: "13px", color: "#BBB" }}>
                  Nadie con pedidos activos
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {data.operarios_carga.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "13px",
                        paddingBottom: "6px",
                        borderBottom: "1px solid #F5F5F5",
                      }}
                    >
                      <span style={{ color: "#555" }}>👷 {o.nombre}</span>
                      <span style={{ fontWeight: 700, color: "#0A0A0A" }}>
                        {o.pedidos_activos}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
