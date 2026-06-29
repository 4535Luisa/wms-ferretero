import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import api from "../services/api";

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
  mono: { fontFamily: "DM Mono, monospace" },
};

const estadoColor = {
  aprobado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  rechazado: { bg: "#FEE2E2", fg: "#991B1B" },
};

const labelStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#555",
  display: "block",
  marginBottom: "4px",
};
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #E8E8E8",
  borderRadius: "8px",
  fontSize: "14px",
  fontFamily: "Outfit, sans-serif",
  boxSizing: "border-box",
};

// Descarga un arreglo de objetos como CSV (se abre en Excel).
function descargarCSV(nombre, filas, columnas) {
  if (!filas || filas.length === 0) return;
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columnas.map((c) => esc(c.label)).join(",");
  const body = filas
    .map((f) => columnas.map((c) => esc(f[c.key])).join(","))
    .join("\n");
  const csv = `${head}\n${body}`;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function KpiCard({ titulo, valor, color = "#0A0A0A" }) {
  return (
    <div style={{ ...C.card, padding: "1rem 1.25rem" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#888",
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          ...C.mono,
          fontSize: "26px",
          fontWeight: 700,
          color,
          marginTop: "4px",
        }}
      >
        {valor}
      </div>
    </div>
  );
}

export default function Gerente() {
  const [tab, setTab] = useState("aprobaciones");
  const [ajustes, setAjustes] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [comentario, setComentario] = useState("");

  // Reportes: catálogos para los selectores y filtros del export.
  const [opciones, setOpciones] = useState({ bodegas: [], operarios: [] });
  const [filtro, setFiltro] = useState({
    desde: "",
    hasta: "",
    bodega_id: "",
    operario_id: "",
  });
  const [exportando, setExportando] = useState(false);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const [a, k, f] = await Promise.all([
        api.get("/api/ajustes"),
        api.get("/api/reportes/kpis"),
        api.get("/api/reportes/filtros"),
      ]);
      setAjustes(a.data || []);
      setKpis(k.data || null);
      setOpciones(f.data || { bodegas: [], operarios: [] });
    } catch (err) {
      console.error(err);
    }
  };

  // Exporta un libro Excel (.xlsx) multi-hoja con KPIs + movimientos del período.
  const exportarExcel = async () => {
    if (!kpis) return;
    setExportando(true);
    try {
      const params = {};
      if (filtro.desde) params.desde = new Date(filtro.desde).toISOString();
      if (filtro.hasta) {
        // Incluye todo el día "hasta".
        const h = new Date(filtro.hasta);
        h.setHours(23, 59, 59, 999);
        params.hasta = h.toISOString();
      }
      if (filtro.bodega_id) params.bodega_id = filtro.bodega_id;
      if (filtro.operario_id) params.operario_id = filtro.operario_id;

      const { data } = await api.get("/api/reportes/movimientos", { params });
      const movs = data.movimientos || [];

      const wb = XLSX.utils.book_new();

      const resumen = [
        ["Reporte WMS MACHO", ""],
        ["Generado", new Date().toLocaleString("es-CO")],
        ["Período desde", filtro.desde || "—"],
        ["Período hasta", filtro.hasta || "—"],
        [
          "Bodega",
          opciones.bodegas.find((b) => b.id === filtro.bodega_id)?.codigo ||
            "Todas",
        ],
        [
          "Operario",
          opciones.operarios.find((o) => o.id === filtro.operario_id)?.nombre ||
            "Todos",
        ],
        ["", ""],
        ["Pedidos totales", kpis.pedidos.total],
        ["Pedidos facturados", kpis.pedidos.facturados],
        ["Urgentes activos", kpis.pedidos.urgentes_activos],
        ["Referencias con stock", kpis.inventario.referencias_con_stock],
        ["Unidades en stock", kpis.inventario.total_unidades],
        ["Quiebres", kpis.inventario.quiebres_total],
        ["Sobrestock", kpis.inventario.sobrestock_total],
      ];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(resumen),
        "Resumen",
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          (kpis.productividad || []).map((p) => ({
            Operario: p.operario,
            "Pedidos facturados": p.completados,
          })),
        ),
        "Productividad",
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          (kpis.quiebres || []).map((q) => ({
            Referencia: q.codigo,
            Descripción: q.descripcion,
            Disponible: q.disponible,
          })),
        ),
        "Quiebres",
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          (kpis.sobrestock || []).map((s) => ({
            Referencia: s.codigo,
            Descripción: s.descripcion,
            Disponible: s.disponible,
          })),
        ),
        "Sobrestock",
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          movs.map((m) => ({
            Fecha: new Date(m.fecha).toLocaleString("es-CO"),
            Usuario: m.usuario,
            Acción: m.accion,
            Referencia: m.referencia,
            Producto: m.producto,
            Bodega: m.bodega,
            Antes: m.antes,
            Después: m.despues,
          })),
        ),
        "Movimientos",
      );

      const hoy = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `reporte_wms_${hoy}.xlsx`);
      aviso(
        `✓ Excel generado — ${movs.length} movimiento(s)${data.truncado ? " (truncado a 5000)" : ""}`,
      );
    } catch (err) {
      aviso(err.response?.data?.error || "Error al exportar", "error");
    } finally {
      setExportando(false);
    }
  };

  // Dispara la generación de alertas proactivas (quiebre/sobrestock).
  const generarAlertas = async () => {
    setCargando(true);
    try {
      const { data } = await api.post("/api/reportes/alertas");
      aviso(
        `✓ ${data.generadas} alerta(s) enviadas a ${data.destinatarios} usuario(s)` +
          (data.omitidos_ya_alertados_hoy
            ? ` · ${data.omitidos_ya_alertados_hoy} omitidas (ya alertadas hoy)`
            : ""),
      );
    } catch (err) {
      aviso(err.response?.data?.error || "Error al generar alertas", "error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const aprobar = async (id) => {
    setCargando(true);
    try {
      const { data } = await api.patch(`/api/ajustes/${id}/aprobar`);
      aviso(`✓ Ajuste aprobado — disponible: ${data.cantidad_disponible ?? "—"}`);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al aprobar", "error");
    } finally {
      setCargando(false);
    }
  };

  const rechazar = async (id) => {
    setCargando(true);
    try {
      await api.patch(`/api/ajustes/${id}/rechazar`, { comentario });
      aviso("Ajuste rechazado");
      setRechazandoId(null);
      setComentario("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al rechazar", "error");
    } finally {
      setCargando(false);
    }
  };

  const pendientes = ajustes.filter((a) => a.estado === "pendiente");
  const resueltos = ajustes.filter((a) => a.estado !== "pendiente");

  const Tabs = (
    <div
      style={{
        display: "flex",
        gap: "8px",
        marginBottom: "1.25rem",
        borderBottom: "1px solid #F0F0F0",
      }}
    >
      {[
        { id: "aprobaciones", label: `Aprobaciones (${pendientes.length})` },
        { id: "indicadores", label: "Indicadores" },
        { id: "reportes", label: "Reportes" },
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${tab === t.id ? "#00CC6A" : "transparent"}`,
            color: tab === t.id ? "#0A0A0A" : "#888",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            padding: "8px 4px",
            fontFamily: "Outfit, sans-serif",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <Layout
      titulo="Gerente Logístico"
      subtitulo={`${pendientes.length} ajuste${pendientes.length !== 1 ? "s" : ""} por aprobar`}
    >
      {mensaje.texto && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            fontSize: "13px",
            fontWeight: 500,
            background:
              mensaje.tipo === "error" ? "#FEE2E2" : "rgba(0,255,135,0.1)",
            color: mensaje.tipo === "error" ? "#991B1B" : "#007A40",
            border: `1px solid ${mensaje.tipo === "error" ? "#FECACA" : "rgba(0,255,135,0.2)"}`,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      {Tabs}

      {/* ---------- APROBACIONES ---------- */}
      {tab === "aprobaciones" && (
        <>
          <h3
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#854D0E",
              marginBottom: "0.75rem",
            }}
          >
            Ajustes por aprobar
          </h3>
          {pendientes.length === 0 ? (
            <div
              style={{
                ...C.card,
                textAlign: "center",
                color: "#888",
                marginBottom: "2rem",
              }}
            >
              No hay ajustes pendientes
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "2rem",
              }}
            >
              {pendientes.map((a) => (
                <div
                  key={a.id}
                  style={{ ...C.card, borderLeft: "4px solid #854D0E" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {a.productos?.descripcion_corta || "—"}
                      </div>
                      <div
                        style={{
                          ...C.mono,
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "3px",
                        }}
                      >
                        {a.productos?.codigo_interno} · {a.bodegas?.codigo} ·{" "}
                        {a.tipo}{" "}
                        <strong
                          style={{
                            color:
                              a.sentido === "incremento" ? "#007A40" : "#991B1B",
                          }}
                        >
                          {a.sentido === "incremento" ? "+" : "−"}
                          {a.cantidad}
                        </strong>
                      </div>
                      <div
                        style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
                      >
                        {a.motivo}
                      </div>
                      {a.solicitante && (
                        <div
                          style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}
                        >
                          Solicitó: {a.solicitante}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button
                        onClick={() => aprobar(a.id)}
                        disabled={cargando}
                        style={{
                          background: "#00FF87",
                          color: "#0A0A0A",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "Outfit, sans-serif",
                        }}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() =>
                          setRechazandoId(rechazandoId === a.id ? null : a.id)
                        }
                        disabled={cargando}
                        style={{
                          background: "transparent",
                          color: "#991B1B",
                          border: "1.5px solid #FECACA",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Outfit, sans-serif",
                        }}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>

                  {rechazandoId === a.id && (
                    <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                      <input
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        placeholder="Comentario (opcional)"
                        style={{
                          flex: 1,
                          padding: "9px 12px",
                          border: "1.5px solid #E8E8E8",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontFamily: "Outfit, sans-serif",
                        }}
                      />
                      <button
                        onClick={() => rechazar(a.id)}
                        disabled={cargando}
                        style={{
                          background: "#991B1B",
                          color: "#FFF",
                          border: "none",
                          borderRadius: "8px",
                          padding: "9px 16px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "Outfit, sans-serif",
                        }}
                      >
                        Confirmar rechazo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#666",
              marginBottom: "0.75rem",
            }}
          >
            Resueltos recientes
          </h3>
          {resueltos.length === 0 ? (
            <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
              Sin ajustes resueltos
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {resueltos.slice(0, 30).map((a) => {
                const ec = estadoColor[a.estado] || estadoColor.aprobado;
                return (
                  <div
                    key={a.id}
                    style={{
                      ...C.card,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        {a.productos?.descripcion_corta || "—"}
                      </div>
                      <div
                        style={{
                          ...C.mono,
                          fontSize: "11px",
                          color: "#888",
                          marginTop: "2px",
                        }}
                      >
                        {a.productos?.codigo_interno} · {a.bodegas?.codigo} ·{" "}
                        {a.tipo} {a.sentido === "incremento" ? "+" : "−"}
                        {a.cantidad}
                        {a.aprobador ? ` · ${a.aprobador}` : ""}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        background: ec.bg,
                        color: ec.fg,
                        borderRadius: "20px",
                        padding: "4px 10px",
                        flexShrink: 0,
                      }}
                    >
                      {a.estado}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------- INDICADORES ---------- */}
      {tab === "indicadores" &&
        (!kpis ? (
          <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
            Cargando indicadores…
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "10px",
                marginBottom: "1.5rem",
              }}
            >
              <KpiCard titulo="Pedidos totales" valor={kpis.pedidos.total} />
              <KpiCard
                titulo="Facturados"
                valor={kpis.pedidos.facturados}
                color="#007A40"
              />
              <KpiCard
                titulo="Urgentes activos"
                valor={kpis.pedidos.urgentes_activos}
                color={kpis.pedidos.urgentes_activos > 0 ? "#B91C1C" : "#0A0A0A"}
              />
              <KpiCard
                titulo="Refs con stock"
                valor={kpis.inventario.referencias_con_stock}
              />
              <KpiCard
                titulo="Unidades en stock"
                valor={kpis.inventario.total_unidades}
              />
              <KpiCard
                titulo={`Quiebres (≤${kpis.inventario.umbral_bajo})`}
                valor={kpis.inventario.quiebres_total}
                color={kpis.inventario.quiebres_total > 0 ? "#B91C1C" : "#0A0A0A"}
              />
              <KpiCard
                titulo={`Sobrestock (≥${kpis.inventario.umbral_alto})`}
                valor={kpis.inventario.sobrestock_total}
              />
              <KpiCard
                titulo="Ajustes pendientes"
                valor={kpis.pendientes.ajustes}
                color={kpis.pendientes.ajustes > 0 ? "#854D0E" : "#0A0A0A"}
              />
              <KpiCard
                titulo="Traslados en tránsito"
                valor={kpis.pendientes.traslados_en_transito}
              />
              <KpiCard
                titulo="Conteos pendientes"
                valor={kpis.pendientes.conteos}
              />
            </div>

            {/* Pedidos por estado */}
            <div style={{ ...C.card, marginBottom: "1.5rem" }}>
              <h3
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "18px",
                  letterSpacing: "0.04em",
                  margin: "0 0 0.75rem",
                }}
              >
                Pedidos por estado
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {Object.entries(kpis.pedidos.por_estado).map(([e, n]) => (
                  <span
                    key={e}
                    style={{
                      background: "#F3F4F6",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "13px",
                    }}
                  >
                    {e}: <strong>{n}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Productividad */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#666",
                  margin: 0,
                }}
              >
                Productividad (pedidos facturados por operario)
              </h3>
              <button
                onClick={() =>
                  descargarCSV("productividad.csv", kpis.productividad, [
                    { key: "operario", label: "Operario" },
                    { key: "completados", label: "Completados" },
                  ])
                }
                style={{
                  background: "transparent",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                ⬇ CSV
              </button>
            </div>
            <div style={{ ...C.card, marginBottom: "1.5rem" }}>
              {kpis.productividad.length === 0 ? (
                <span style={{ color: "#888", fontSize: "13px" }}>Sin datos</span>
              ) : (
                kpis.productividad.map((p) => (
                  <div
                    key={p.operario}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px solid #F5F5F5",
                      fontSize: "13px",
                    }}
                  >
                    <span>{p.operario}</span>
                    <strong>{p.completados}</strong>
                  </div>
                ))
              )}
            </div>

            {/* Quiebres */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#B91C1C",
                  margin: 0,
                }}
              >
                Alertas de quiebre
              </h3>
              <button
                onClick={() =>
                  descargarCSV("quiebres.csv", kpis.quiebres, [
                    { key: "codigo", label: "Referencia" },
                    { key: "descripcion", label: "Descripción" },
                    { key: "disponible", label: "Disponible" },
                  ])
                }
                style={{
                  background: "transparent",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                ⬇ CSV
              </button>
            </div>
            <div style={{ ...C.card }}>
              {kpis.quiebres.length === 0 ? (
                <span style={{ color: "#888", fontSize: "13px" }}>
                  Sin quiebres bajo el umbral
                </span>
              ) : (
                kpis.quiebres.map((q) => (
                  <div
                    key={q.producto_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px solid #F5F5F5",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ ...C.mono, fontWeight: 700 }}>
                        {q.codigo || "—"}
                      </span>{" "}
                      <span style={{ color: "#666" }}>{q.descripcion}</span>
                    </span>
                    <strong style={{ color: "#B91C1C" }}>{q.disponible}</strong>
                  </div>
                ))
              )}
            </div>
          </>
        ))}

      {/* ---------- REPORTES ---------- */}
      {tab === "reportes" && (
        <>
          <div style={{ ...C.card, marginBottom: "1.5rem" }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "18px",
                letterSpacing: "0.04em",
                margin: "0 0 1rem",
              }}
            >
              Exportar a Excel
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
                marginBottom: "1rem",
              }}
            >
              <div>
                <label style={labelStyle}>Desde</label>
                <input
                  type="date"
                  value={filtro.desde}
                  onChange={(e) =>
                    setFiltro((f) => ({ ...f, desde: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Hasta</label>
                <input
                  type="date"
                  value={filtro.hasta}
                  onChange={(e) =>
                    setFiltro((f) => ({ ...f, hasta: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Bodega</label>
                <select
                  value={filtro.bodega_id}
                  onChange={(e) =>
                    setFiltro((f) => ({ ...f, bodega_id: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">Todas</option>
                  {opciones.bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} — {b.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Operario</label>
                <select
                  value={filtro.operario_id}
                  onChange={(e) =>
                    setFiltro((f) => ({ ...f, operario_id: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">Todos</option>
                  {opciones.operarios.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre} ({o.rol})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={exportarExcel}
              disabled={exportando || !kpis}
              style={{
                background: "#00FF87",
                color: "#0A0A0A",
                border: "none",
                borderRadius: "10px",
                padding: "12px 22px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: exportando ? "not-allowed" : "pointer",
                fontFamily: "Outfit, sans-serif",
                opacity: exportando ? 0.6 : 1,
                minHeight: "44px",
              }}
            >
              {exportando ? "Generando…" : "⬇ Exportar Excel"}
            </button>
            <p style={{ fontSize: "12px", color: "#AAA", marginTop: "10px" }}>
              Hojas: Resumen, Productividad, Quiebres, Sobrestock y Movimientos
              (filtrados por período, bodega y operario).
            </p>
          </div>

          <div style={{ ...C.card }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "18px",
                letterSpacing: "0.04em",
                margin: "0 0 0.5rem",
              }}
            >
              Alertas proactivas de inventario
            </h3>
            <p style={{ fontSize: "13px", color: "#666", margin: "0 0 1rem" }}>
              Notifica a inventarios y gerencia los productos en quiebre (stock
              bajo) y sobrestock. Se omiten los ya alertados hoy.
            </p>
            <button
              onClick={generarAlertas}
              disabled={cargando}
              style={{
                background: "#0A0A0A",
                color: "#00FF87",
                border: "none",
                borderRadius: "10px",
                padding: "12px 22px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: cargando ? "not-allowed" : "pointer",
                fontFamily: "Outfit, sans-serif",
                minHeight: "44px",
              }}
            >
              🔔 Generar alertas ahora
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
