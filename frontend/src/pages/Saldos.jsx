import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import ScanInput, { bip } from "../components/ScanInput";
import api from "../services/api";

const REFRESCO_MS = 15000;

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
  mono: { fontFamily: "DM Mono, monospace" },
};

const semaforoColor = {
  rojo: { bg: "#FEE2E2", fg: "#B91C1C", label: "URGENTE" },
  amarillo: { bg: "#FEF9C3", fg: "#854D0E", label: "PRONTO" },
  verde: { bg: "rgba(0,255,135,0.1)", fg: "#007A40", label: "NORMAL" },
};

// Resuelve EAN-13 → codigo_interno si aplica
async function resolverEscaneado(valor) {
  const v = String(valor || "")
    .trim()
    .toUpperCase();
  if (!v) return v;
  if (!/^\d{8,14}$/.test(v)) return v;
  try {
    const { data } = await api.get(
      `/api/productos/buscar-barras?codigo_barras=${v}`,
    );
    if (data?.codigo_interno) return data.codigo_interno.trim().toUpperCase();
  } catch {
    /* best-effort */
  }
  return v;
}

export default function Saldos() {
  const [operarios, setOperarios] = useState([]);
  const [entrantes, setEntrantes] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [entregando, setEntregando] = useState(null); // { producto_id, operario_id, descripcion, referencia, requerido, disponible }
  const [cantidadEntrega, setCantidadEntrega] = useState("");
  const idsEntrantes = useRef(null);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const { data } = await api.get("/api/saldos");
      const nuevasEntrantes = data.entrantes || [];
      setOperarios(data.operarios || []);
      setEntrantes(nuevasEntrantes);

      // Alerta cuando llega una caja nueva del montacarguista
      const idsActuales = new Set(nuevasEntrantes.map((e) => e.id));
      if (idsEntrantes.current) {
        const nuevas = nuevasEntrantes.filter(
          (e) => !idsEntrantes.current.has(e.id),
        );
        if (nuevas.length > 0) {
          bip("ok");
          aviso(
            `🔔 Llegó ${nuevas.length} caja(s) de reposición — escanea para confirmar`,
          );
        }
      }
      idsEntrantes.current = idsActuales;
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmar caja de reposición escaneando
  const onEscanearEntrante = async (refEscaneada) => {
    const codigoResuelto = await resolverEscaneado(refEscaneada);
    const norm = codigoResuelto.trim().toUpperCase();
    const objetivo = entrantes.find(
      (e) => (e.referencia || "").trim().toUpperCase() === norm,
    );
    if (!objetivo) {
      bip("error");
      aviso(
        `⚠ Caja incorrecta: ${refEscaneada} no está entre las cajas por confirmar`,
        "error",
      );
      return;
    }
    setCargando(true);
    try {
      await api.patch(`/api/saldos/caja/${objetivo.id}/confirmar`, {
        referencia_escaneada: refEscaneada,
      });
      bip("ok");
      aviso("✓ Caja confirmada — inventario de SALDOS actualizado");
      await cargar();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  // Entregar unidades al operario
  const entregar = async () => {
    if (!entregando) return;
    const { producto_id, operario_id, requerido } = entregando;
    setCargando(true);
    try {
      await api.patch("/api/saldos/entregar", {
        producto_id,
        operario_id,
        cantidad: requerido,
      });
      bip("ok");
      aviso("✓ Saldo entregado al operario");
      setEntregando(null);
      await cargar();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al entregar", "error");
    } finally {
      setCargando(false);
    }
  };

  const totalOperarios = operarios.length;
  const totalItems = operarios.reduce((a, op) => a + op.items.length, 0);
  const itemsFaltantes = operarios.reduce(
    (a, op) => a + op.items.filter((i) => !i.cubierto).length,
    0,
  );

  return (
    <Layout
      titulo="Cola de Saldos"
      subtitulo={`${totalOperarios} operario${totalOperarios !== 1 ? "s" : ""} · ${totalItems} referencia${totalItems !== 1 ? "s" : ""} · ${entrantes.length} caja${entrantes.length !== 1 ? "s" : ""} por confirmar`}
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

      {/* Modal de entrega */}
      {entregando && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "380px",
            }}
          >
            <div
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "22px",
                marginBottom: "8px",
              }}
            >
              Confirmar entrega
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#0A0A0A",
                marginBottom: "4px",
              }}
            >
              {entregando.descripcion}
            </div>
            <div
              style={{
                ...C.mono,
                fontSize: "12px",
                color: "#888",
                marginBottom: "16px",
              }}
            >
              Ref: {entregando.referencia} · Operario:{" "}
              {entregando.operario_nombre}
            </div>
            <div
              style={{
                background: "#F8F8F8",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#888" }}>Requerido</div>
                <div
                  style={{
                    ...C.mono,
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "#0A0A0A",
                  }}
                >
                  {entregando.requerido}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#888" }}>En SALDOS</div>
                <div
                  style={{
                    ...C.mono,
                    fontSize: "22px",
                    fontWeight: 700,
                    color:
                      entregando.disponible >= entregando.requerido
                        ? "#007A40"
                        : "#991B1B",
                  }}
                >
                  {entregando.disponible}
                </div>
              </div>
            </div>
            {entregando.disponible < entregando.requerido && (
              <div
                style={{
                  background: "#FEE2E2",
                  color: "#991B1B",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                ⚠ Stock insuficiente — confirma primero la caja de reposición
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setEntregando(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  background: "transparent",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={entregar}
                disabled={
                  cargando || entregando.disponible < entregando.requerido
                }
                style={{
                  flex: 2,
                  padding: "12px",
                  border: "none",
                  borderRadius: "8px",
                  background:
                    entregando.disponible >= entregando.requerido
                      ? "#00FF87"
                      : "#E8E8E8",
                  color:
                    entregando.disponible >= entregando.requerido
                      ? "#0A0A0A"
                      : "#AAA",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor:
                    entregando.disponible >= entregando.requerido
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                ✓ Entregar {entregando.requerido} unidades
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cajas de reposición entrantes */}
      {entrantes.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "0.75rem",
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#854D0E",
                margin: 0,
              }}
            >
              📥 Cajas por confirmar ({entrantes.length})
            </h3>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#F59E0B",
                animation: "pulse 1s infinite",
              }}
            />
          </div>
          <ScanInput
            onScan={onEscanearEntrante}
            disabled={cargando}
            label="Escanea la caja de reposición"
            hint="Escanea el código de barras de la caja que bajó el montacarguista — el inventario sube automáticamente"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {entrantes.map((e) => (
              <div
                key={e.id}
                style={{
                  ...C.card,
                  background: "#FFFBEB",
                  borderColor: "#FDE68A",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>
                    {e.descripcion}
                  </div>
                  <div
                    style={{
                      ...C.mono,
                      fontSize: "12px",
                      color: "#888",
                      marginTop: "3px",
                    }}
                  >
                    Ref: {e.referencia} ·{" "}
                    {e.cantidad_unidades || e.cantidad_cajas + " cajas"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#854D0E",
                    background: "#FEF3C7",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    flexShrink: 0,
                  }}
                >
                  Escanea para confirmar
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista por operario */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
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
          Lista de saldos por operario
        </h3>
        {itemsFaltantes > 0 && (
          <span
            style={{
              background: "#FEE2E2",
              color: "#991B1B",
              padding: "3px 10px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {itemsFaltantes} sin stock suficiente
          </span>
        )}
      </div>

      {operarios.length === 0 ? (
        <div style={{ ...C.card, padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📦</div>
          <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
            No hay solicitudes de saldos pendientes
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {operarios.map((op) => {
            const sem = semaforoColor[op.semaforo] || semaforoColor.verde;
            return (
              <div
                key={op.operario_id}
                style={{ ...C.card, borderLeft: `4px solid ${sem.fg}` }}
              >
                {/* Header del operario */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#0A0A0A",
                      }}
                    >
                      {op.operario_nombre}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#888",
                        marginTop: "2px",
                      }}
                    >
                      {op.items.length} referencia
                      {op.items.length !== 1 ? "s" : ""} de saldos
                    </div>
                  </div>
                  <span
                    style={{
                      background: sem.bg,
                      color: sem.fg,
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {sem.label}
                  </span>
                </div>

                {/* Items de saldos */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {op.items.map((item) => (
                    <div
                      key={`${item.pedido_id}-${item.producto_id}`}
                      style={{
                        background: item.cubierto
                          ? "rgba(0,255,135,0.04)"
                          : item.entrantes.length > 0
                            ? "#FFFBEB"
                            : "#F8F8F8",
                        border: `1px solid ${item.cubierto ? "rgba(0,255,135,0.2)" : item.entrantes.length > 0 ? "#FDE68A" : "#E8E8E8"}`,
                        borderRadius: "10px",
                        padding: "10px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#0A0A0A",
                          }}
                        >
                          {item.descripcion}
                        </div>
                        <div
                          style={{
                            ...C.mono,
                            fontSize: "11px",
                            color: "#888",
                            marginTop: "3px",
                          }}
                        >
                          Ref: {item.referencia} · Pedido: {item.pedido_numero}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            flexWrap: "wrap",
                            marginTop: "6px",
                          }}
                        >
                          <span
                            style={{
                              background: "#F0F0F0",
                              color: "#374151",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 600,
                            }}
                          >
                            Necesita: {item.unidades_requeridas} u
                          </span>
                          <span
                            style={{
                              background:
                                item.stock_disponible >=
                                item.unidades_requeridas
                                  ? "rgba(0,255,135,0.1)"
                                  : "#FEE2E2",
                              color:
                                item.stock_disponible >=
                                item.unidades_requeridas
                                  ? "#007A40"
                                  : "#991B1B",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 600,
                            }}
                          >
                            En SALDOS: {item.stock_disponible} u
                          </span>
                          {item.faltante > 0 && item.entrantes.length > 0 && (
                            <span
                              style={{
                                background: "#FEF9C3",
                                color: "#854D0E",
                                padding: "2px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: 600,
                              }}
                            >
                              📥 Caja en camino
                            </span>
                          )}
                          {item.faltante > 0 && item.entrantes.length === 0 && (
                            <span
                              style={{
                                background: "#FEE2E2",
                                color: "#991B1B",
                                padding: "2px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: 600,
                              }}
                            >
                              ⚠ Falta: {item.faltante} u
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {item.cubierto ? (
                          <button
                            onClick={() =>
                              setEntregando({
                                producto_id: item.producto_id,
                                operario_id: op.operario_id,
                                operario_nombre: op.operario_nombre,
                                descripcion: item.descripcion,
                                referencia: item.referencia,
                                requerido: item.unidades_requeridas,
                                disponible: item.stock_disponible,
                              })
                            }
                            style={{
                              background: "#00FF87",
                              color: "#0A0A0A",
                              border: "none",
                              borderRadius: "8px",
                              padding: "9px 16px",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              minHeight: "44px",
                            }}
                          >
                            Entregar
                          </button>
                        ) : item.entrantes.length > 0 ? (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#854D0E",
                              background: "#FEF3C7",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontWeight: 600,
                              display: "block",
                              textAlign: "center",
                            }}
                          >
                            Esperando caja
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#991B1B",
                              background: "#FEE2E2",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontWeight: 600,
                              display: "block",
                              textAlign: "center",
                            }}
                          >
                            Sin stock
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
