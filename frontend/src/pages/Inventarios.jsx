import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import BuscadorProducto from "../components/BuscadorProducto";
import api from "../services/api";

const TIPOS = [
  { id: "averia", label: "Avería" },
  { id: "perdida", label: "Pérdida" },
  { id: "sobrante", label: "Sobrante" },
  { id: "error", label: "Error" },
  { id: "merma", label: "Merma" },
  { id: "correccion", label: "Corrección" },
];

const estadoColor = {
  pendiente: { bg: "#FEF9C3", fg: "#854D0E" },
  aprobado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  rechazado: { bg: "#FEE2E2", fg: "#991B1B" },
  en_transito: { bg: "#FEF9C3", fg: "#854D0E" },
  completado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  cancelado: { bg: "#FEE2E2", fg: "#991B1B" },
  pendiente_conteo: { bg: "#E0E7FF", fg: "#3730A3" },
  contado: { bg: "#FEF9C3", fg: "#854D0E" },
  sin_diferencia: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
  ajustado: { bg: "rgba(0,255,135,0.12)", fg: "#007A40" },
};

const C = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: "12px",
    padding: "1.25rem 1.5rem",
  },
  mono: { fontFamily: "DM Mono, monospace" },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "Outfit, sans-serif",
    boxSizing: "border-box",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#555",
    display: "block",
    marginBottom: "4px",
  },
  btnPrimary: {
    width: "100%",
    background: "#00FF87",
    color: "#0A0A0A",
    border: "none",
    borderRadius: "10px",
    padding: "13px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Outfit, sans-serif",
  },
};

export default function Inventarios() {
  const [tab, setTab] = useState("ajustes");
  const [bodegas, setBodegas] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [traslados, setTraslados] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  // Form ajuste.
  const [prodAjuste, setProdAjuste] = useState(null);
  const [bodegaId, setBodegaId] = useState("");
  const [tipo, setTipo] = useState("averia");
  const [sentido, setSentido] = useState("decremento");
  const [cantAjuste, setCantAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");

  // Form traslado.
  const [prodTras, setProdTras] = useState(null);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [cantTras, setCantTras] = useState("");
  const [motivoTras, setMotivoTras] = useState("");

  // Conteos.
  const [conteos, setConteos] = useState([]);
  const [prodConteo, setProdConteo] = useState(null);
  const [bodegaConteo, setBodegaConteo] = useState("");
  const [cantContada, setCantContada] = useState("");
  const [miniConteoId, setMiniConteoId] = useState(null);

  // Programar conteo por familia.
  const [familias, setFamilias] = useState([]);
  const [familiaProg, setFamiliaProg] = useState("");
  const [bodegaProg, setBodegaProg] = useState("");

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const [b, a, t, c, f] = await Promise.all([
        api.get("/api/usuarios/bodegas"),
        api.get("/api/ajustes"),
        api.get("/api/traslados"),
        api.get("/api/conteos"),
        api.get("/api/conteos/familias"),
      ]);
      setBodegas(b.data || []);
      setAjustes(a.data || []);
      setTraslados(t.data || []);
      setConteos(c.data || []);
      setFamilias(f.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const crearAjuste = async () => {
    if (!prodAjuste) return aviso("Selecciona un producto", "error");
    if (!bodegaId) return aviso("Selecciona una bodega", "error");
    if (!cantAjuste || Number(cantAjuste) <= 0)
      return aviso("La cantidad debe ser mayor a 0", "error");
    if (!motivoAjuste.trim()) return aviso("El motivo es obligatorio", "error");

    setCargando(true);
    try {
      await api.post("/api/ajustes", {
        producto_id: prodAjuste.id,
        bodega_id: bodegaId,
        tipo,
        sentido,
        cantidad: Number(cantAjuste),
        motivo: motivoAjuste.trim(),
      });
      aviso("✓ Ajuste registrado — pendiente de aprobación del gerente");
      setProdAjuste(null);
      setBodegaId("");
      setCantAjuste("");
      setMotivoAjuste("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al registrar el ajuste", "error");
    } finally {
      setCargando(false);
    }
  };

  const crearTraslado = async () => {
    if (!prodTras) return aviso("Selecciona un producto", "error");
    if (!origen || !destino) return aviso("Selecciona origen y destino", "error");
    if (origen === destino)
      return aviso("El origen y el destino deben ser distintos", "error");
    if (!cantTras || Number(cantTras) <= 0)
      return aviso("La cantidad debe ser mayor a 0", "error");

    setCargando(true);
    try {
      await api.post("/api/traslados", {
        producto_id: prodTras.id,
        bodega_origen_id: origen,
        bodega_destino_id: destino,
        cantidad: Number(cantTras),
        motivo: motivoTras.trim() || undefined,
      });
      aviso("✓ Traslado enviado — pendiente de confirmar en destino");
      setProdTras(null);
      setOrigen("");
      setDestino("");
      setCantTras("");
      setMotivoTras("");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al crear el traslado", "error");
    } finally {
      setCargando(false);
    }
  };

  const accionTraslado = async (id, accion) => {
    setCargando(true);
    try {
      await api.patch(`/api/traslados/${id}/${accion}`);
      aviso(accion === "confirmar" ? "✓ Traslado confirmado" : "Traslado cancelado");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error", "error");
    } finally {
      setCargando(false);
    }
  };

  const programarConteo = async () => {
    if (!familiaProg) return aviso("Selecciona una familia", "error");
    if (!bodegaProg) return aviso("Selecciona una bodega", "error");
    setCargando(true);
    try {
      const { data } = await api.post("/api/conteos/programar", {
        familia: familiaProg,
        bodega_id: bodegaProg,
      });
      aviso(`✓ ${data.mensaje}`);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al programar el conteo", "error");
    } finally {
      setCargando(false);
    }
  };

  const registrarConteo = async () => {
    if (!prodConteo) return aviso("Selecciona un producto", "error");
    if (!bodegaConteo) return aviso("Selecciona una bodega", "error");
    if (cantContada === "" || Number(cantContada) < 0)
      return aviso("Ingresa la cantidad contada", "error");

    setCargando(true);
    try {
      const { data } = await api.post("/api/conteos", {
        producto_id: prodConteo.id,
        bodega_id: bodegaConteo,
        cantidad_contada: Number(cantContada),
        mini_conteo_id: miniConteoId || undefined,
      });
      aviso(`✓ ${data.mensaje}`);
      setProdConteo(null);
      setBodegaConteo("");
      setCantContada("");
      setMiniConteoId(null);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al registrar el conteo", "error");
    } finally {
      setCargando(false);
    }
  };

  const generarAjusteConteo = async (id) => {
    setCargando(true);
    try {
      await api.patch(`/api/conteos/${id}/generar-ajuste`);
      aviso("✓ Ajuste generado — pendiente de aprobación del gerente");
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al generar el ajuste", "error");
    } finally {
      setCargando(false);
    }
  };

  // Prepara el formulario para contar un mini-conteo pendiente (p. ej. de picking).
  const contarPendiente = (mc) => {
    setTab("conteos");
    setMiniConteoId(mc.id);
    setProdConteo(
      mc.productos
        ? { id: mc.producto_id, codigo_interno: mc.productos.codigo_interno }
        : { id: mc.producto_id },
    );
    setBodegaConteo(mc.bodega_id || "");
    setCantContada("");
  };

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
        { id: "ajustes", label: "Ajustes" },
        { id: "traslados", label: "Traslados" },
        { id: "conteos", label: "Conteos" },
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
    <Layout titulo="Inventarios" subtitulo="Ajustes y traslados de inventario">
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

      {/* ---------- AJUSTES ---------- */}
      {tab === "ajustes" && (
        <>
          <div style={{ ...C.card, maxWidth: "640px", marginBottom: "2rem" }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                letterSpacing: "0.04em",
                margin: "0 0 1rem",
              }}
            >
              Nuevo ajuste
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <BuscadorProducto onSelect={setProdAjuste} />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={C.label}>Bodega *</label>
              <select
                style={C.input}
                value={bodegaId}
                onChange={(e) => setBodegaId(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.codigo} — {b.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <label style={C.label}>Tipo *</label>
                <select
                  style={C.input}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={C.label}>Sentido *</label>
                <select
                  style={C.input}
                  value={sentido}
                  onChange={(e) => setSentido(e.target.value)}
                >
                  <option value="decremento">Restar (−)</option>
                  <option value="incremento">Sumar (+)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={C.label}>Cantidad *</label>
              <input
                type="number"
                min="1"
                style={C.input}
                value={cantAjuste}
                onChange={(e) => setCantAjuste(e.target.value)}
                placeholder="Unidades a ajustar"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={C.label}>Motivo *</label>
              <input
                style={C.input}
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                placeholder="Describe la razón del ajuste"
              />
            </div>

            <button
              onClick={crearAjuste}
              disabled={cargando}
              style={{ ...C.btnPrimary, opacity: cargando ? 0.6 : 1 }}
            >
              Registrar ajuste
            </button>
          </div>

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
            Historial de ajustes
          </h3>
          {ajustes.length === 0 ? (
            <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
              Aún no hay ajustes registrados
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {ajustes.map((a) => {
                const ec = estadoColor[a.estado] || estadoColor.pendiente;
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
                        {a.tipo} {a.sentido === "incremento" ? "+" : "−"}
                        {a.cantidad}
                      </div>
                      <div
                        style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}
                      >
                        {a.motivo}
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

      {/* ---------- TRASLADOS ---------- */}
      {tab === "traslados" && (
        <>
          <div style={{ ...C.card, maxWidth: "640px", marginBottom: "2rem" }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                letterSpacing: "0.04em",
                margin: "0 0 1rem",
              }}
            >
              Nuevo traslado
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <BuscadorProducto onSelect={setProdTras} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <label style={C.label}>Origen *</label>
                <select
                  style={C.input}
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={C.label}>Destino *</label>
                <select
                  style={C.input}
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={C.label}>Cantidad *</label>
              <input
                type="number"
                min="1"
                style={C.input}
                value={cantTras}
                onChange={(e) => setCantTras(e.target.value)}
                placeholder="Unidades a trasladar"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={C.label}>Motivo</label>
              <input
                style={C.input}
                value={motivoTras}
                onChange={(e) => setMotivoTras(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <button
              onClick={crearTraslado}
              disabled={cargando}
              style={{ ...C.btnPrimary, opacity: cargando ? 0.6 : 1 }}
            >
              Enviar traslado
            </button>
          </div>

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
            Traslados
          </h3>
          {traslados.length === 0 ? (
            <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
              Aún no hay traslados
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {traslados.map((t) => {
                const ec = estadoColor[t.estado] || estadoColor.en_transito;
                return (
                  <div
                    key={t.id}
                    style={{
                      ...C.card,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {t.productos?.descripcion_corta || "—"}
                      </div>
                      <div
                        style={{
                          ...C.mono,
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "3px",
                        }}
                      >
                        {t.productos?.codigo_interno} · {t.origen?.codigo || "?"}{" "}
                        → {t.destino?.codigo || "?"} · {t.cantidad} und
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {t.estado === "en_transito" ? (
                        <>
                          <button
                            onClick={() => accionTraslado(t.id, "confirmar")}
                            disabled={cargando}
                            style={{
                              background: "#00FF87",
                              color: "#0A0A0A",
                              border: "none",
                              borderRadius: "8px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                            }}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => accionTraslado(t.id, "cancelar")}
                            disabled={cargando}
                            style={{
                              background: "transparent",
                              color: "#991B1B",
                              border: "1.5px solid #FECACA",
                              borderRadius: "8px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                            }}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: ec.bg,
                            color: ec.fg,
                            borderRadius: "20px",
                            padding: "4px 10px",
                          }}
                        >
                          {t.estado}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------- CONTEOS ---------- */}
      {tab === "conteos" && (
        <>
          <div style={{ ...C.card, maxWidth: "640px", marginBottom: "1.5rem" }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                letterSpacing: "0.04em",
                margin: "0 0 0.25rem",
              }}
            >
              Programar conteo por familia
            </h3>
            <p style={{ fontSize: "12px", color: "#888", margin: "0 0 1rem" }}>
              Encola un conteo pendiente para cada producto de la familia con
              inventario en la bodega elegida.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <label style={C.label}>Familia *</label>
                <select
                  style={C.input}
                  value={familiaProg}
                  onChange={(e) => setFamiliaProg(e.target.value)}
                >
                  <option value="">
                    {familias.length === 0 ? "Sin familias cargadas" : "Selecciona…"}
                  </option>
                  {familias.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={C.label}>Bodega *</label>
                <select
                  style={C.input}
                  value={bodegaProg}
                  onChange={(e) => setBodegaProg(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.codigo} — {b.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={programarConteo}
              disabled={cargando || familias.length === 0}
              style={{
                ...C.btnPrimary,
                opacity: cargando || familias.length === 0 ? 0.6 : 1,
              }}
            >
              Programar conteo
            </button>
          </div>

          <div style={{ ...C.card, maxWidth: "640px", marginBottom: "2rem" }}>
            <h3
              style={{
                fontFamily: "Bebas Neue, sans-serif",
                fontSize: "20px",
                letterSpacing: "0.04em",
                margin: "0 0 1rem",
              }}
            >
              Registrar conteo
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <BuscadorProducto onSelect={setProdConteo} />
              {prodConteo && (
                <div
                  style={{
                    ...C.mono,
                    fontSize: "12px",
                    color: "#007A40",
                    marginTop: "6px",
                  }}
                >
                  Seleccionado: {prodConteo.codigo_interno || prodConteo.id}
                </div>
              )}
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={C.label}>Bodega *</label>
              <select
                style={C.input}
                value={bodegaConteo}
                onChange={(e) => setBodegaConteo(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.codigo} — {b.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={C.label}>Cantidad contada *</label>
              <input
                type="number"
                min="0"
                style={C.input}
                value={cantContada}
                onChange={(e) => setCantContada(e.target.value)}
                placeholder="Unidades contadas físicamente"
              />
            </div>

            <button
              onClick={registrarConteo}
              disabled={cargando}
              style={{ ...C.btnPrimary, opacity: cargando ? 0.6 : 1 }}
            >
              Registrar conteo
            </button>
          </div>

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
            Cola de conteos
          </h3>
          {conteos.length === 0 ? (
            <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
              Aún no hay conteos
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {conteos.map((c) => {
                const ec = estadoColor[c.estado] || estadoColor.pendiente_conteo;
                return (
                  <div
                    key={c.id}
                    style={{
                      ...C.card,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>
                        {c.productos?.descripcion_corta || "—"}
                      </div>
                      <div
                        style={{
                          ...C.mono,
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "3px",
                        }}
                      >
                        {c.productos?.codigo_interno}
                        {c.bodegas?.codigo ? ` · ${c.bodegas.codigo}` : ""}
                        {c.origen === "picking" ? " · desde picking" : ""}
                        {c.diferencia != null && c.estado !== "pendiente"
                          ? ` · sistema ${c.cantidad_sistema} / contado ${c.cantidad_contada} (${c.diferencia > 0 ? "+" : ""}${c.diferencia})`
                          : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {c.estado === "pendiente" && (
                        <button
                          onClick={() => contarPendiente(c)}
                          disabled={cargando}
                          style={{
                            background: "#0A0A0A",
                            color: "#FFF",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "Outfit, sans-serif",
                          }}
                        >
                          Contar
                        </button>
                      )}
                      {c.estado === "contado" && (
                        <button
                          onClick={() => generarAjusteConteo(c.id)}
                          disabled={cargando}
                          style={{
                            background: "#00FF87",
                            color: "#0A0A0A",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "Outfit, sans-serif",
                          }}
                        >
                          Generar ajuste
                        </button>
                      )}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          background: ec.bg,
                          color: ec.fg,
                          borderRadius: "20px",
                          padding: "4px 10px",
                        }}
                      >
                        {c.estado}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
