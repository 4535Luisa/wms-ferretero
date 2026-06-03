import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
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

export default function Operario() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cantidadEdit, setCantidadEdit] = useState("");
  const [motivoEdit, setMotivoEdit] = useState("");
  // Referencia escaneada por ítem (itemId -> ref). El escaneo habilita las
  // acciones de alistado; el backend re-verifica antes de marcar listo.
  const [refsEscaneadas, setRefsEscaneadas] = useState({});

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // Solo al montar: cargar se redefine cada render; no debe ir en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const abrir = (p) => {
    setActivo(p);
    setVista("detalle");
    setEditando(null);
    setRefsEscaneadas({});
  };

  // El escaneo verifica que la caja recogida de la estiba es del pedido y
  // habilita su alistado. Cruza contra la referencia de cada ítem pendiente.
  const onEscanear = (refEscaneada) => {
    const norm = refEscaneada.trim().toUpperCase();
    const objetivo = (activo?.pedido_items || []).find(
      (i) =>
        i.estado !== "listo" &&
        (i.productos?.codigo_interno || "").trim().toUpperCase() === norm,
    );
    if (!objetivo) {
      aviso(
        `Referencia incorrecta: ${norm} no pertenece a este pedido o ya está lista`,
        "error",
      );
      return;
    }
    setRefsEscaneadas((prev) => ({ ...prev, [objetivo.id]: refEscaneada }));
    aviso(`✓ ${objetivo.productos?.descripcion_corta || norm} verificada — ya puedes alistarla`);
  };

  const progreso = (p) => {
    const total = p.pedido_items?.length || 0;
    const listos =
      p.pedido_items?.filter((i) => i.estado === "listo").length || 0;
    return { total, listos, pct: total ? Math.round((listos / total) * 100) : 0 };
  };

  const marcarListo = async (item) => {
    setCargando(true);
    try {
      await api.patch(`/api/pedidos/items/${item.id}`, {
        estado: "listo",
        referencia_escaneada: refsEscaneadas[item.id],
      });
      aviso("✓ Referencia verificada y marcada como lista");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al marcar", "error");
    } finally {
      setCargando(false);
    }
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
        estado: "listo",
        referencia_escaneada: refsEscaneadas[item.id],
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
      aviso("✓ Pedido cerrado y enviado a facturación");
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
                        <span style={{ ...C.mono, fontSize: "16px", fontWeight: 700 }}>
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
                      <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
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
                        {pr.listos}/{pr.total} listas
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
          {!cerrado && (
            <ScanInput
              onScan={onEscanear}
              disabled={cargando}
              label="Escanea la caja que recoges de la estiba"
              hint="Verifica que la referencia es de este pedido antes de alistarla"
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(activo.pedido_items || []).map((item) => {
              const listo = item.estado === "listo";
              const enEdicion = editando === item.id;
              const escaneado = !!refsEscaneadas[item.id];
              const cajaUnidades =
                (item.cantidad_pedida || 0) - (item.cantidad_saldos || 0);
              return (
                <div
                  key={item.id}
                  style={{
                    ...C.card,
                    borderColor: listo ? "rgba(0,255,135,0.35)" : "#E8E8E8",
                    background: listo ? "rgba(0,255,135,0.04)" : "#FFFFFF",
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
                          color: listo ? "#007A40" : "#0A0A0A",
                        }}
                      >
                        {item.productos?.descripcion_corta || item.descripcion}
                      </div>
                      <div style={{ ...C.mono, fontSize: "12px", color: "#888", marginTop: "3px" }}>
                        Ref: {item.productos?.codigo_interno} · Pedido:{" "}
                        {item.cantidad_pedida} u
                        {item.cantidad_picking != null &&
                          item.cantidad_picking !== item.cantidad_pedida && (
                            <span style={{ color: "#854D0E" }}>
                              {" "}· Alistado: {item.cantidad_picking}
                            </span>
                          )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginTop: "8px",
                        }}
                      >
                        {cajaUnidades > 0 && (
                          <span
                            style={{
                              background: "#F3F4F6",
                              color: "#374151",
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            📦 Cajas: {item.cajas_bajadas || 0}/{item.cajas_total || 0}{" "}
                            bajadas
                          </span>
                        )}
                        {item.estiba_nombre && (
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
                            🟦 Estiba: {item.estiba_nombre}
                          </span>
                        )}
                        {item.cantidad_saldos > 0 && (
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
                            Saldos: {item.cantidad_saldos} u (bodega SALDOS)
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
                    {!cerrado && (
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {listo ? (
                          <span style={{ color: "#00CC6A", fontWeight: 700, fontSize: "20px" }}>
                            ✓
                          </span>
                        ) : !escaneado ? (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "#854D0E",
                              background: "#FEF9C3",
                              borderRadius: "8px",
                              padding: "8px 12px",
                            }}
                          >
                            Escanea para alistar
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <button
                              onClick={() => marcarListo(item)}
                              disabled={cargando}
                              style={{
                                background: "#00FF87",
                                color: "#0A0A0A",
                                border: "none",
                                borderRadius: "8px",
                                padding: "8px 14px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Marcar lista
                            </button>
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
                          </div>
                        )}
                      </div>
                    )}
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
                      <label style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}>
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
                          <label style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}>
                            Motivo de la diferencia (obligatorio)
                          </label>
                          <textarea
                            value={motivoEdit}
                            onChange={(e) => setMotivoEdit(e.target.value)}
                            rows={2}
                            placeholder="Ej: solo se encontraron 8 unidades en la ubicación"
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
                        Guardar y marcar lista
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
                }}
              >
                {todoListo
                  ? "✓ Cerrar pedido y enviar a facturación"
                  : `Faltan ${prog.total - prog.listos} referencia(s) por marcar`}
              </button>
              <p style={{ fontSize: "11px", color: "#AAA", textAlign: "center", marginTop: "8px" }}>
                Una vez cerrado no podrás editarlo. Solo el administrador puede reabrirlo.
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
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#007A40", margin: 0 }}>
                ✓ Pedido cerrado — en cola de facturación
              </p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
