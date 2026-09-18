import { useState, useEffect } from "react";
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

export default function Verificacion() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [modalDiferencia, setModalDiferencia] = useState(null);
  const [modalSaldo, setModalSaldo] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [cantidadReal, setCantidadReal] = useState("");
  const [cantidadSaldoRecibida, setCantidadSaldoRecibida] = useState("");

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargarLista = async () => {
    try {
      const { data } = await api.get("/api/verificacion");
      setPedidos(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargarLista();
  }, []);

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`/api/verificacion/${id}`);
      setActivo(data);
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  const recargarActivo = async () => {
    if (!activo?.id) return;
    try {
      const { data } = await api.get(`/api/verificacion/${activo.id}`);
      setActivo(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Calcula el estado de verificacion de un item
  const itemVerifInfo = (item) => {
    const ue = item.productos?.unidad_empaque || 1;
    const cantPicking = item.cantidad_picking ?? item.cantidad_pedida ?? 0;
    const cantSaldos = item.cantidad_saldos || 0;
    const unidadesCajas = cantPicking - cantSaldos;
    const cajasCompletas =
      unidadesCajas > 0 ? Math.ceil(unidadesCajas / ue) : 0;
    const unidadesVerificadas = item.unidades_verificadas || 0;
    const cajasVerificadas = ue > 0 ? Math.floor(unidadesVerificadas / ue) : 0;
    const cajasListas = cajasVerificadas >= cajasCompletas;
    const tieneSaldos = cantSaldos > 0;
    const saldoVerificado = item.saldo_verificado === true;
    const completo =
      item.verificado === true && (!tieneSaldos || saldoVerificado);
    return {
      ue,
      cantPicking,
      cantSaldos,
      unidadesCajas,
      cajasCompletas,
      cajasVerificadas,
      cajasListas,
      tieneSaldos,
      saldoVerificado,
      completo,
    };
  };

  // Escaneo de caja: el jefe escanea EAN14 de cada caja fisica
  const onEscanear = async (refEscaneada) => {
    if (!activo) return;

    // Buscar el item que corresponde al codigo escaneado y tiene cajas pendientes
    // La busqueda la hace el backend via resolverCodigoEscaneado
    // En el frontend buscamos por codigo_interno o ean14 para dar feedback rapido
    const norm = refEscaneada.trim().toUpperCase();
    const objetivo = (activo.pedido_items || []).find((item) => {
      const info = itemVerifInfo(item);
      if (info.cajasListas) return false;
      if (item.verificado && !item.saldo_verificado && info.tieneSaldos)
        return false;
      const ci = (item.productos?.codigo_interno || "").trim().toUpperCase();
      const ean = (item.productos?.ean14 || "").trim().toUpperCase();
      // Limpiar prefijo GS1 01 si viene del scanner
      const normLimpio = norm.replace(/^01(\d{14})$/, "$1");
      return (
        ci === norm || ean === norm || ci === normLimpio || ean === normLimpio
      );
    });

    if (!objetivo) {
      // Ver si ya esta completo
      const yaCompleto = (activo.pedido_items || []).find((item) => {
        const info = itemVerifInfo(item);
        const ci = (item.productos?.codigo_interno || "").trim().toUpperCase();
        const ean = (item.productos?.ean14 || "").trim().toUpperCase();
        const normLimpio = norm.replace(/^01(\d{14})$/, "$1");
        return (
          info.cajasListas &&
          (ci === norm ||
            ean === norm ||
            ci === normLimpio ||
            ean === normLimpio)
        );
      });
      bip("error");
      aviso(
        yaCompleto
          ? `Las cajas de ${yaCompleto.productos?.codigo_interno} ya estan verificadas`
          : `Codigo no reconocido: ${refEscaneada}`,
        "error",
      );
      return;
    }

    setCargando(true);
    try {
      const { data } = await api.patch(
        `/api/verificacion/${activo.id}/items/${objetivo.id}/verificar`,
        { referencia_escaneada: refEscaneada },
      );
      bip("ok");
      const info = itemVerifInfo(objetivo);
      aviso(
        data.cajasListas
          ? `Cajas de ${objetivo.productos?.codigo_interno} completadas`
          : `Caja escaneada (${data.cajasVerificadas}/${data.cajasCompletas})`,
      );
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al verificar", "error");
    } finally {
      setCargando(false);
    }
  };

  // Confirmar saldo recibido manualmente
  const confirmarSaldo = async () => {
    if (!modalSaldo || cantidadSaldoRecibida === "") return;
    setCargando(true);
    try {
      const { data } = await api.patch(
        `/api/verificacion/${activo.id}/items/${modalSaldo.item.id}/saldo`,
        { cantidad_saldo_recibida: Number(cantidadSaldoRecibida) },
      );
      bip("ok");
      aviso(data.mensaje || "Saldo confirmado");
      setModalSaldo(null);
      setCantidadSaldoRecibida("");
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al confirmar saldo", "error");
    } finally {
      setCargando(false);
    }
  };

  const registrarDiferencia = async () => {
    if (!modalDiferencia || !cantidadReal || !motivo.trim()) return;
    setCargando(true);
    try {
      await api.post(
        `/api/verificacion/${activo.id}/items/${modalDiferencia.item.id}/diferencia`,
        { cantidad_real: Number(cantidadReal), motivo: motivo.trim() },
      );
      bip("ok");
      aviso("Diferencia registrada");
      setModalDiferencia(null);
      setMotivo("");
      setCantidadReal("");
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(
        err.response?.data?.error || "Error al registrar diferencia",
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const confirmar = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.patch(`/api/verificacion/${activo.id}/confirmar`);
      aviso("Pedido verificado y enviado a facturacion");
      setVista("lista");
      setActivo(null);
      await cargarLista();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const confirmarConDiferencias = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.post(`/api/verificacion/${activo.id}/confirmar-diferencias`);
      aviso("Pedido aprobado con diferencias — enviado a facturacion");
      setVista("lista");
      setActivo(null);
      await cargarLista();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const items = activo?.pedido_items || [];
  const itemsInfo = items.map((i) => ({ item: i, info: itemVerifInfo(i) }));
  const todosCompletos =
    items.length > 0 && itemsInfo.every(({ info }) => info.completo);
  const hayDiferencias = items.some((i) => i.motivo_diferencia);
  const todosVerificadosODiferencia =
    items.length > 0 &&
    itemsInfo.every(
      ({ item, info }) => info.completo || item.motivo_diferencia,
    );

  return (
    <Layout
      titulo="Verificacion"
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} por verificar`
          : `Pedido ${activo?.numero}`
      }
    >
      {vista === "detalle" && (
        <button
          onClick={() => {
            setVista("lista");
            setActivo(null);
            cargarLista();
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
            fontFamily: "Outfit, sans-serif",
            marginBottom: "1.25rem",
          }}
        >
          Volver
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

      {/* LISTA DE PEDIDOS */}
      {vista === "lista" &&
        (pedidos.length === 0 ? (
          <div style={{ ...C.card, padding: "3rem", textAlign: "center" }}>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
              No hay pedidos por verificar
            </p>
            <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
              Cuando un operario cierre un pedido aparecera aqui
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pedidos.map((p) => (
              <div
                key={p.id}
                onClick={() => abrir(p.id)}
                style={{
                  ...C.card,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{ ...C.mono, fontSize: "14px", fontWeight: 700 }}
                  >
                    {p.numero}
                  </span>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#888",
                      marginTop: "4px",
                    }}
                  >
                    {p.pedido_items?.length || 0} referencias
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "#00CC6A",
                    fontWeight: 600,
                  }}
                >
                  Verificar
                </span>
              </div>
            ))}
          </div>
        ))}

      {/* DETALLE DEL PEDIDO */}
      {vista === "detalle" && activo && (
        <div style={{ maxWidth: "720px" }}>
          <ScanInput
            onScan={onEscanear}
            disabled={cargando || todosCompletos}
            label="Escanea cada caja fisica para verificar"
            hint="Cada escaneo cuenta 1 caja — escanea tantas cajas como haya fisicamente"
            autoFocus
          />

          <div style={{ ...C.card, marginTop: "1rem", padding: "0.5rem 1rem" }}>
            {itemsInfo.map(({ item, info }, idx) => (
              <div
                key={item.id}
                style={{
                  padding: "0.875rem 0.5rem",
                  borderBottom:
                    idx < items.length - 1 ? "1px solid #F5F5F5" : "none",
                  background: info.completo
                    ? "rgba(0,255,135,0.04)"
                    : "#FFFFFF",
                }}
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
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                      {item.productos?.descripcion_corta || item.descripcion}
                    </div>
                    <div
                      style={{
                        ...C.mono,
                        fontSize: "11px",
                        color: "#888",
                        marginTop: "2px",
                      }}
                    >
                      {item.productos?.codigo_interno} · Pedido:{" "}
                      {info.cantPicking} u
                    </div>

                    {/* Progreso cajas */}
                    {info.cajasCompletas > 0 && (
                      <div style={{ marginTop: "8px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            color: "#888",
                            marginBottom: "3px",
                          }}
                        >
                          <span>
                            Cajas: {info.cajasVerificadas}/{info.cajasCompletas}{" "}
                            ({info.ue} u/caja)
                          </span>
                          <span
                            style={{
                              color: info.cajasListas ? "#007A40" : "#888",
                            }}
                          >
                            {info.cajasListas
                              ? "Completo"
                              : `Faltan ${info.cajasCompletas - info.cajasVerificadas}`}
                          </span>
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
                              width: `${info.cajasCompletas > 0 ? Math.min(100, Math.round((info.cajasVerificadas / info.cajasCompletas) * 100)) : 0}%`,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Saldos */}
                    {info.tieneSaldos && (
                      <div
                        style={{
                          marginTop: "8px",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            background: info.saldoVerificado
                              ? "rgba(0,255,135,0.1)"
                              : "#FEF9C3",
                            color: info.saldoVerificado ? "#007A40" : "#854D0E",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          Saldos: {info.cantSaldos} u —{" "}
                          {info.saldoVerificado
                            ? `Recibido: ${item.cantidad_saldo_recibida ?? info.cantSaldos} u`
                            : "pendiente confirmar"}
                        </span>
                        {info.cajasListas && !info.saldoVerificado && (
                          <button
                            onClick={() => {
                              setModalSaldo({ item, info });
                              setCantidadSaldoRecibida(String(info.cantSaldos));
                            }}
                            style={{
                              background: "#0A0A0A",
                              color: "#00FF87",
                              border: "none",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Confirmar saldo
                          </button>
                        )}
                      </div>
                    )}

                    {item.motivo_diferencia && (
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "11px",
                          color: "#B91C1C",
                          fontWeight: 500,
                        }}
                      >
                        Diferencia: {item.motivo_diferencia}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      textAlign: "right",
                      minWidth: "80px",
                    }}
                  >
                    {info.completo ? (
                      <span
                        style={{
                          color: "#00CC6A",
                          fontWeight: 700,
                          fontSize: "22px",
                        }}
                      >
                        OK
                      </span>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          alignItems: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: info.cajasListas ? "#3730A3" : "#854D0E",
                            background: info.cajasListas
                              ? "#EEF2FF"
                              : "#FEF9C3",
                            borderRadius: "8px",
                            padding: "6px 10px",
                          }}
                        >
                          {info.cajasListas
                            ? "Falta saldo"
                            : `Escanea ${info.cajasCompletas - info.cajasVerificadas} caja${info.cajasCompletas - info.cajasVerificadas !== 1 ? "s" : ""}`}
                        </span>
                        {!item.motivo_diferencia && (
                          <button
                            onClick={() => {
                              setModalDiferencia({ item });
                              setCantidadReal(String(info.cantPicking));
                              setMotivo("");
                            }}
                            style={{
                              background: "#FEF9C3",
                              color: "#854D0E",
                              border: "1px solid #FDE68A",
                              borderRadius: "6px",
                              padding: "4px 10px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Registrar diferencia
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Modal confirmar saldo */}
          {modalSaldo && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 500,
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
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    margin: "0 0 4px 0",
                  }}
                >
                  Confirmar saldo recibido
                </h3>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#888",
                    margin: "0 0 16px 0",
                  }}
                >
                  {modalSaldo.item.productos?.descripcion_corta} — Esperado:{" "}
                  {modalSaldo.info.cantSaldos} u
                </p>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#666",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Cantidad realmente recibida
                </label>
                <input
                  type="number"
                  value={cantidadSaldoRecibida}
                  onChange={(e) => setCantidadSaldoRecibida(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E8E8E8",
                    borderRadius: "8px",
                    fontSize: "14px",
                    marginBottom: "16px",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setModalSaldo(null)}
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
                    onClick={confirmarSaldo}
                    disabled={cargando || cantidadSaldoRecibida === ""}
                    style={{
                      flex: 2,
                      padding: "12px",
                      border: "none",
                      borderRadius: "8px",
                      background: "#0A0A0A",
                      color: "#00FF87",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal diferencia */}
          {modalDiferencia && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 500,
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
                  maxWidth: "400px",
                }}
              >
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    margin: "0 0 4px 0",
                  }}
                >
                  Registrar diferencia
                </h3>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#888",
                    margin: "0 0 16px 0",
                  }}
                >
                  {modalDiferencia.item.productos?.descripcion_corta}
                </p>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#666",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Cantidad real despachada
                </label>
                <input
                  type="number"
                  value={cantidadReal}
                  onChange={(e) => setCantidadReal(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E8E8E8",
                    borderRadius: "8px",
                    fontSize: "14px",
                    marginBottom: "12px",
                    boxSizing: "border-box",
                  }}
                />
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#666",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Motivo de la diferencia *
                </label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: Caja no encontrada en bodega"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E8E8E8",
                    borderRadius: "8px",
                    fontSize: "14px",
                    marginBottom: "16px",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setModalDiferencia(null)}
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
                    onClick={registrarDiferencia}
                    disabled={cargando || !motivo.trim() || !cantidadReal}
                    style={{
                      flex: 2,
                      padding: "12px",
                      border: "none",
                      borderRadius: "8px",
                      background: "#0A0A0A",
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Registrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Botones de confirmacion */}
          <div style={{ marginTop: "1rem" }}>
            {todosCompletos ? (
              <button
                onClick={confirmar}
                disabled={cargando}
                style={{
                  width: "100%",
                  background: "#00FF87",
                  color: "#0A0A0A",
                  border: "none",
                  borderRadius: "10px",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                Confirmar verificacion — enviar a facturacion
              </button>
            ) : todosVerificadosODiferencia && hayDiferencias ? (
              <button
                onClick={confirmarConDiferencias}
                disabled={cargando}
                style={{
                  width: "100%",
                  background: "#FEF9C3",
                  color: "#854D0E",
                  border: "1px solid #FDE68A",
                  borderRadius: "10px",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                Aprobar despacho con diferencias
              </button>
            ) : (
              <div
                style={{
                  width: "100%",
                  background: "#E8E8E8",
                  color: "#999",
                  borderRadius: "10px",
                  padding: "14px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {itemsInfo.filter(
                  ({ info }) => !info.completo && !info.cajasListas,
                ).length > 0
                  ? `Faltan cajas por escanear`
                  : `Faltan saldos por confirmar`}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
