import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const TABS = [
  { id: "kpis", label: "KPIs del dia" },
  { id: "alistamiento", label: "Tiempo de alistamiento" },
  { id: "errores", label: "Errores de escaneo" },
  { id: "referencias", label: "Referencias despachadas" },
];

export default function Reportes() {
  const [tab, setTab] = useState("kpis");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async (tabId) => {
    setCargando(true);
    setError(null);
    setDatos(null);
    try {
      let url = "";
      if (tabId === "kpis") url = "/api/reportes/kpis";
      else if (tabId === "alistamiento")
        url = "/api/reportes/tiempo-alistamiento";
      else if (tabId === "errores")
        url = "/api/alertas/errores-escaneo/reporte";
      else if (tabId === "referencias")
        url = "/api/reportes/referencias-despachadas";
      const { data } = await api.get(url);
      setDatos(data);
    } catch (err) {
      setError(err.response?.data?.error || "Error al cargar el reporte");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(tab);
  }, [tab]);

  const fmtNum = (n) => Number(n || 0).toLocaleString("es-CO");
  const fmtMin = (m) =>
    m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;

  const BarChart = ({ data, labelKey, valueKey, color = "#00FF87" }) => {
    if (!data?.length)
      return <p style={{ color: "#888", fontSize: "13px" }}>Sin datos</p>;
    const max = Math.max(...data.map((d) => d[valueKey]));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            <div
              style={{
                width: "140px",
                fontSize: "12px",
                color: "#374151",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {d[labelKey]}
            </div>
            <div
              style={{
                flex: 1,
                background: "#F0F0F0",
                borderRadius: "4px",
                height: "20px",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${max > 0 ? (d[valueKey] / max) * 100 : 0}%`,
                  background: color,
                  height: "100%",
                  borderRadius: "4px",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <div
              style={{
                width: "50px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#0A0A0A",
                textAlign: "right",
                fontFamily: "DM Mono, monospace",
                flexShrink: 0,
              }}
            >
              {fmtNum(d[valueKey])}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderKpis = () => {
    if (!datos) return null;
    const cards = [
      {
        label: "Pedidos activos",
        valor: datos.pedidos_activos || 0,
        color: "#0A0A0A",
      },
      {
        label: "Pedidos urgentes",
        valor: datos.urgentes || 0,
        color: "#991B1B",
      },
      {
        label: "Facturados hoy",
        valor: datos.facturados || 0,
        color: "#007A40",
      },
      {
        label: "Referencias con stock",
        valor: datos.refs_con_stock || 0,
        color: "#374151",
      },
      {
        label: "Total unidades",
        valor: datos.total_unidades || 0,
        color: "#374151",
      },
      {
        label: "Quiebres de stock",
        valor: datos.quiebre?.length || 0,
        color: "#854D0E",
      },
    ];
    return (
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "2rem",
          }}
        >
          {cards.map((c, i) => (
            <div
              key={i}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: "28px",
                  fontWeight: 700,
                  color: c.color,
                }}
              >
                {fmtNum(c.valor)}
              </div>
            </div>
          ))}
        </div>

        {datos.productividad?.length > 0 && (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                margin: "0 0 16px 0",
              }}
            >
              Productividad por operario
            </h3>
            <BarChart
              data={datos.productividad}
              labelKey="nombre"
              valueKey="pedidos"
            />
          </div>
        )}

        {datos.por_estado && (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                margin: "0 0 16px 0",
              }}
            >
              Pedidos por estado
            </h3>
            <BarChart
              data={Object.entries(datos.por_estado).map(([k, v]) => ({
                estado: k,
                cantidad: v,
              }))}
              labelKey="estado"
              valueKey="cantidad"
              color="#0A0A0A"
            />
          </div>
        )}
      </div>
    );
  };

  const renderAlistamiento = () => {
    if (!datos) return null;
    return (
      <div>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "1rem",
          }}
        >
          <h3
            style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 16px 0" }}
          >
            Promedio por operario
          </h3>
          <BarChart
            data={(datos.por_operario || []).map((op) => ({
              nombre: op.operario,
              promedio: op.promedio_minutos,
            }))}
            labelKey="nombre"
            valueKey="promedio"
            color="#0A0A0A"
          />
        </div>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
          }}
        >
          <h3
            style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px 0" }}
          >
            Detalle por pedido
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #E8E8E8" }}>
                  {["Pedido", "Operario", "Estado", "Tiempo"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontWeight: 700,
                        color: "#374151",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(datos.detalle || []).slice(0, 50).map((d, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "DM Mono, monospace",
                      }}
                    >
                      {d.pedido_numero}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{d.operario}</td>
                    <td style={{ padding: "8px 12px" }}>{d.estado}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700 }}>
                      {fmtMin(d.minutos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderErrores = () => {
    if (!datos) return null;
    return (
      <div>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "1rem",
          }}
        >
          <h3
            style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 16px 0" }}
          >
            Errores por operario
          </h3>
          <BarChart
            data={(datos.por_usuario || []).map((u) => ({
              nombre: u.nombre,
              errores: u.total_errores,
            }))}
            labelKey="nombre"
            valueKey="errores"
            color="#991B1B"
          />
        </div>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
          }}
        >
          <h3
            style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px 0" }}
          >
            Detalle de errores
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #E8E8E8" }}>
                  {[
                    "Usuario",
                    "Pedido",
                    "Escaneado",
                    "Esperado",
                    "Modulo",
                    "Hora",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontWeight: 700,
                        color: "#374151",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(datos.detalle || []).slice(0, 100).map((d, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <td style={{ padding: "8px 12px" }}>
                      {d.usuarios?.nombre || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "DM Mono, monospace",
                      }}
                    >
                      {d.pedidos?.numero || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "DM Mono, monospace",
                        color: "#991B1B",
                      }}
                    >
                      {d.codigo_escaneado}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "DM Mono, monospace",
                      }}
                    >
                      {d.codigo_esperado || "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{d.modulo}</td>
                    <td style={{ padding: "8px 12px", color: "#888" }}>
                      {new Date(d.created_at).toLocaleString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderReferencias = () => {
    if (!datos) return null;
    return (
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E8E8E8",
          borderRadius: "12px",
          padding: "1.5rem",
        }}
      >
        <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 16px 0" }}>
          Top {datos.total} referencias mas despachadas
        </h3>
        <BarChart
          data={(datos.referencias || []).map((r) => ({
            ref: r.referencia + " - " + (r.descripcion?.substring(0, 20) || ""),
            unidades: r.total_unidades,
          }))}
          labelKey="ref"
          valueKey="unidades"
        />
      </div>
    );
  };

  return (
    <Layout titulo="Reportes" subtitulo="KPIs y analisis de la operacion">
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "1.5rem",
          background: "#F0F0F0",
          padding: "4px",
          borderRadius: "10px",
          width: "fit-content",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "none",
              background: tab === t.id ? "#FFFFFF" : "transparent",
              color: "#0A0A0A",
              fontFamily: "Outfit, sans-serif",
              fontSize: "13px",
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer",
              boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {cargando && (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: "#888",
            fontSize: "14px",
          }}
        >
          Cargando...
        </div>
      )}
      {error && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#991B1B",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {!cargando && !error && (
        <>
          {tab === "kpis" && renderKpis()}
          {tab === "alistamiento" && renderAlistamiento()}
          {tab === "errores" && renderErrores()}
          {tab === "referencias" && renderReferencias()}
        </>
      )}
    </Layout>
  );
}
