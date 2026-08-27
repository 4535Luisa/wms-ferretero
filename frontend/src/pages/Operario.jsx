import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import ScanInput, { bip } from "../components/ScanInput";
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

export default function Operario() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cantidadEdit, setCantidadEdit] = useState("");
  const [motivoEdit, setMotivoEdit] = useState("");

  const [searchParams] = useSearchParams();

  const cargar = async () => {
    try {
      const { data } = await api.get("/api/pedidos/mis-pedidos");
      setPedidos(data);
      if (activo) {
        const act = data.find((p) => p.id === activo.id);
        if (act) setActivo(act);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const abrir = (p) => {
    setActivo(p);
    setVista("detalle");
    setEditando(null);
  };

  // Calcula el estado de un ítem considerando cajas + saldos
  const itemInfo = (item) => {
    const ue = item.productos?.unidad_empaque || 1;
    const cantPedida = item.cantidad_pedida || 0;
    const cantSaldos = item.cantidad_saldos || 0;
    const unidadesCajas = cantPedida - cantSaldos;
    const cajasCompletas =
      unidadesCajas > 0 ? Math.ceil(unidadesCajas / ue) : 0;
    const unidadesEscaneadas = item.unidades_escaneadas || 0;
    const cajasEscaneadas = ue > 0 ? Math.floor(unidadesEscaneadas / ue) : 0;
    const cajasListas = cajasEscaneadas >= cajasCompletas;
    const completo = item.estado === "completo";
    return {
      ue,
      cantPedida,
      cantSaldos,
      unidadesCajas,
      cajasCompletas,
      cajasEscaneadas,
      cajasListas,
      completo,
    };
  };

  // Escaneo automático caja por caja
  const onEscanear = async (refEscaneada) => {
    const codigoResuelto = await resolverEscaneado(refEscaneada);
    const norm = codigoResuelto.trim().toUpperCase();

    // Buscar el ítem que corresponde a la referencia escaneada y que aún tiene cajas pendientes
    const objetivo = (activo?.pedido_items || []).find((i) => {
      if (i.estado === "completo") return false;
      const { cajasListas } = itemInfo(i);
      if (cajasListas) return false; // todas las cajas ya escaneadas
      return (i.productos?.codigo_interno || "").trim().toUpperCase() === norm;
    });

    if (!objetivo) {
      bip("error");
      // Ver si ya está completo
      const yaCompleto = (activo?.pedido_items || []).find(
        (i) =>
          (i.productos?.codigo_interno || "").trim().toUpperCase() === norm &&
          (i.estado === "completo" || itemInfo(i).cajasListas),
      );
      if (yaCompleto) {
        aviso(`⚠ ${norm} ya tiene todas las cajas escaneadas`, "error");
      } else {
        aviso(
          `⚠ CAJA INCORRECTA: ${refEscaneada} no pertenece a este pedido`,
          "error",
        );
      }
      return;
    }

    setCargando(true);
    try {
      const { data: respuesta } = await api.patch(
        `/api/pedidos/items/${objetivo.id}`,
        {
          estado: "completo",
          referencia_escaneada: refEscaneada,
          escaneo_caja: true,
        },
      );
      bip("ok");
      aviso(respuesta.mensaje || "✓ Caja escaneada");
      await cargar();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al marcar", "error");
    } finally {
      setCargando(false);
    }
  };

  const progreso = (p) => {
    const items = p.pedido_items || [];
    const total = items.length;
    // Un ítem está listo si está completo O si tiene cajas listas y saldos pendientes entregados
    const listos = items.filter((i) => {
      if (i.estado === "completo") return true;
      const info = itemInfo(i);
      return info.cajasListas && info.cantSaldos === 0;
    }).length;
    return {
      total,
      listos,
      pct: total ? Math.round((listos / total) * 100) : 0,
    };
  };

  const guardarEdicion = async (item) => {
    const cantidad = Number(cantidadEdit);
    if (cantidadEdit === "" || isNaN(cantidad) || cantidad < 0) {
      aviso("Cantidad inválida", "error");
      return;
    }
    if (cantidad !== item.cantidad_pedida && !motivoEdit.trim()) {
      aviso("El motivo es obligatorio si cambias la cantidad", "error");
      return;
    }
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/items/${item.id}`, {
        cantidad_picking: cantidad,
        motivo_diferencia: motivoEdit.trim(),
        estado: "completo",
      });
      aviso("✓ Cantidad actualizada");
      setEditando(null);
      setCantidadEdit("");
      setMotivoEdit("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al guardar", "error");
    } finally {
      setCargando(false);
    }
  };

  const cerrar = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/${activo.id}/cerrar`);
      aviso("✓ Pedido cerrado y enviado a verificación");
      setVista("lista");
      setActivo(null);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al cerrar", "error");
    } finally {
      setCargando(false);
    }
  };

  const cerrado = activo?.estado === "cerrado";
  const prog = activo ? progreso(activo) : { total: 0, listos: 0, pct: 0 };
  const todoListo = prog.total > 0 && prog.listos === prog.total;

  return (
    <Layout
      titulo="Mis Pedidos"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} asignado${pedidos.length !== 1 ? "s" : ""}`
          : `Pedido ${activo?.numero}`
      }
    >
      {vista !== "lista" && (
        <button
          onClick={() => {
            setVista("lista");
            setEditando(null);
          }}
          style={{
            background: "transparent",
            color: "#0A0A0A",
            border: "1.5px solid #E8E8E8",
            borderRadius: "8px",
            padding: "9px 18px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "1.25rem",
          }}
        >
          ← Volver
        </button>
      )}

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

      {vista === "lista" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {pedidos.length === 0 ? (
            <div style={{ ...C.card, padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📋</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No tienes pedidos asignados
              </p>
            </div>
          ) : (
            pedidos.map((p) => {
              const pr = progreso(p);
              const esCerrado = p.estado === "cerrado";
              return (
                <div
                  key={p.id}
                  onClick={() => abrir(p)}
                  style={{ ...C.card, cursor: "pointer" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "1rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            ...C.mono,
                            fontSize: "16px",
                            fontWeight: 700,
                          }}
                        >
                          {p.numero}
                        </span>
                        {p.prioridad === "urgente" && (
                          <span
                            style={{
                              background: "#FEE2E2",
                              color: "#B91C1C",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            URGENTE
                          </span>
                        )}
                        {esCerrado && (
                          <span
                            style={{
                              background: "rgba(0,255,135,0.1)",
                              color: "#007A40",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            CERRADO
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#888",
                          marginTop: "4px",
                        }}
                      >
                        {pr.total} referencias
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontFamily: "Bebas Neue, sans-serif",
                          fontSize: "28px",
                          color: pr.pct === 100 ? "#00CC6A" : "#0A0A0A",
                        }}
                      >
                        {pr.pct}%
                      </div>
                      <div style={{ fontSize: "12px", color: "#888" }}>
                        {pr.listos}/{pr.total} alistadas
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#F0F0F0",
                      borderRadius: "4px",
                      height: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: "#00FF87",
                        height: "100%",
                        width: `${pr.pct}%`,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {vista === "detalle" && activo && (
        <div style={{ maxWidth: "780px" }}>
          {/* Progreso */}
          <div
            style={{
              ...C.card,
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", color: "#888" }}>
                Progreso del pedido
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  fontFamily: "DM Mono, monospace",
                  color: "#0A0A0A",
                  marginTop: "2px",
                }}
              >
                {prog.listos} / {prog.total} alistadas
              </div>
            </div>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "#F0F0F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "18px",
                  color: prog.pct === 100 ? "#00CC6A" : "#0A0A0A",
                }}
              >
                {prog.pct}%
              </div>
            </div>
          </div>

          {!cerrado && (
            <ScanInput
              onScan={onEscanear}
              disabled={cargando}
              label="Escanea la caja que recoges de la estiba"
              hint="Cada escaneo descuenta 1 caja — escanea tantas veces como cajas recojas"
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(activo.pedido_items || []).map((item) => {
              const info = itemInfo(item);
              const enEdicion = editando === item.id;
              const progCajas =
                info.cajasCompletas > 0
                  ? Math.round(
                      (info.cajasEscaneadas / info.cajasCompletas) * 100,
                    )
                  : 0;

              return (
                <div
                  key={item.id}
                  style={{
                    ...C.card,
                    borderColor: info.completo
                      ? "rgba(0,255,135,0.35)"
                      : info.cajasListas
                        ? "rgba(0,200,255,0.35)"
                        : "#E8E8E8",
                    background: info.completo
                      ? "rgba(0,255,135,0.04)"
                      : "#FFFFFF",
                    opacity: info.completo ? 0.75 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: info.completo ? "#007A40" : "#0A0A0A",
                        }}
                      >
                        {item.productos?.descripcion_corta || item.descripcion}
                      </div>
                      <div
                        style={{
                          ...C.mono,
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "3px",
                        }}
                      >
                        Ref: {item.productos?.codigo_interno} · Pedido:{" "}
                        {info.cantPedida} u
                      </div>

                      {/* Progreso de cajas */}
                      {info.cajasCompletas > 0 && (
                        <div style={{ marginTop: "8px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "11px",
                              color: "#888",
                              marginBottom: "4px",
                            }}
                          >
                            <span>
                              📦 Cajas: {info.cajasEscaneadas}/
                              {info.cajasCompletas} ({info.ue} u/caja)
                            </span>
                            <span>{progCajas}%</span>
                          </div>
                          <div
                            style={{
                              background: "#F0F0F0",
                              borderRadius: "4px",
                              height: "5px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                background: info.cajasListas
                                  ? "#00FF87"
                                  : "#3B82F6",
                                height: "100%",
                                width: `${progCajas}%`,
                                transition: "width 0.3s",
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Saldos */}
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginTop: "8px",
                        }}
                      >
                        {info.cantSaldos > 0 && (
                          <span
                            style={{
                              background: "#FEF9C3",
                              color: "#854D0E",
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            🪣 Saldos: {info.cantSaldos} u pendientes
                          </span>
                        )}
                        {item.cajasListas && info.cantSaldos > 0 && (
                          <span
                            style={{
                              background: "#EEF2FF",
                              color: "#3730A3",
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            Esperando saldos
                          </span>
                        )}
                        {item.motivo_diferencia && (
                          <span
                            style={{
                              background: "#FEE2E2",
                              color: "#991B1B",
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            ⚠ {item.motivo_diferencia}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      {info.completo ? (
                        <span
                          style={{
                            color: "#00CC6A",
                            fontWeight: 700,
                            fontSize: "24px",
                          }}
                        >
                          ✓
                        </span>
                      ) : info.cajasListas && info.cantSaldos > 0 ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#3730A3",
                            background: "#EEF2FF",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            display: "block",
                          }}
                        >
                          Esperando
                          <br />
                          saldos
                        </span>
                      ) : !info.cajasListas ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "#854D0E",
                              background: "#FEF9C3",
                              borderRadius: "8px",
                              padding: "8px 12px",
                            }}
                          >
                            Escanea
                            <br />
                            {info.cajasCompletas - info.cajasEscaneadas} caja
                            {info.cajasCompletas - info.cajasEscaneadas !== 1
                              ? "s"
                              : ""}
                          </span>
                          {!cerrado && (
                            <button
                              onClick={() => {
                                setEditando(enEdicion ? null : item.id);
                                setCantidadEdit(String(item.cantidad_pedida));
                                setMotivoEdit("");
                              }}
                              style={{
                                background: "transparent",
                                color: "#666",
                                border: "1px solid #E8E8E8",
                                borderRadius: "8px",
                                padding: "7px 14px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {enEdicion && !cerrado && (
                    <div
                      style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #F0F0F0",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#666",
                          fontWeight: 600,
                        }}
                      >
                        Cantidad realmente alistada
                      </label>
                      <input
                        type="number"
                        value={cantidadEdit}
                        onChange={(e) => setCantidadEdit(e.target.value)}
                        style={{
                          padding: "9px 12px",
                          border: "1px solid #E8E8E8",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                      />
                      {Number(cantidadEdit) !== item.cantidad_pedida && (
                        <>
                          <label
                            style={{
                              fontSize: "12px",
                              color: "#666",
                              fontWeight: 600,
                            }}
                          >
                            Motivo de la diferencia (obligatorio)
                          </label>
                          <textarea
                            value={motivoEdit}
                            onChange={(e) => setMotivoEdit(e.target.value)}
                            rows={2}
                            placeholder="Ej: solo se encontraron 8 unidades en la estiba"
                            style={{
                              padding: "9px 12px",
                              border: "1px solid #E8E8E8",
                              borderRadius: "8px",
                              fontSize: "13px",
                              resize: "vertical",
                            }}
                          />
                        </>
                      )}
                      <button
                        onClick={() => guardarEdicion(item)}
                        disabled={cargando}
                        style={{
                          background: "#0A0A0A",
                          color: "#00FF87",
                          border: "none",
                          borderRadius: "8px",
                          padding: "9px 14px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          alignSelf: "flex-start",
                        }}
                      >
                        Guardar y alistar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!cerrado && (
            <div style={{ marginTop: "1.25rem" }}>
              <button
                onClick={cerrar}
                disabled={cargando || !todoListo}
                style={{
                  width: "100%",
                  background: todoListo ? "#00FF87" : "#E8E8E8",
                  color: todoListo ? "#0A0A0A" : "#AAA",
                  border: "none",
                  borderRadius: "10px",
                  padding: "14px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: todoListo && !cargando ? "pointer" : "not-allowed",
                  minHeight: "44px",
                }}
              >
                {todoListo
                  ? "✓ Cerrar pedido y enviar a verificación"
                  : `Faltan ${prog.total - prog.listos} referencia(s) por alistar`}
              </button>
              <p
                style={{
                  fontSize: "11px",
                  color: "#AAA",
                  textAlign: "center",
                  marginTop: "8px",
                }}
              >
                Una vez cerrado no podrás editarlo. Solo el administrador puede
                reabrirlo.
              </p>
            </div>
          )}

          {cerrado && (
            <div
              style={{
                ...C.card,
                marginTop: "1.25rem",
                textAlign: "center",
                background: "rgba(0,255,135,0.06)",
                borderColor: "rgba(0,255,135,0.25)",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#007A40",
                  margin: 0,
                }}
              >
                ✓ Pedido cerrado — en verificación
              </p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
