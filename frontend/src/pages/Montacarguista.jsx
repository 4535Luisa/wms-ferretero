import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
import api from "../services/api";

// Consolida los ítems de una lista por referencia + ubicación: misma referencia
// en la misma ubicación pedida por varios pedidos se muestra como UNA línea con
// el total de cajas (el montacarguista baja todo el grupo de una sola pasada).
const consolidarItems = (items) => {
  const grupos = {};
  for (const it of items || []) {
    const key = `${(it.referencia || "").trim().toUpperCase()}|${it.ubicacion_codigo || ""}`;
    if (!grupos[key]) {
      grupos[key] = {
        key,
        referencia: it.referencia,
        descripcion: it.descripcion,
        ubicacion_codigo: it.ubicacion_codigo,
        destino_saldos: it.destino_saldos,
        items: [],
        cajas_total: 0,
        pedidos: new Set(),
      };
    }
    const g = grupos[key];
    g.items.push(it);
    g.cajas_total += it.cantidad_cajas || 0;
    if (it.pedidos?.numero) g.pedidos.add(it.pedidos.numero);
  }
  return Object.values(grupos)
    .map((g) => ({
      ...g,
      pedidos: [...g.pedidos],
      pendientes: g.items.filter((i) => i.estado === "pendiente"),
      bajada: g.items.every((i) => i.estado !== "pendiente"),
    }))
    .sort((a, b) =>
      (a.ubicacion_codigo || "").localeCompare(b.ubicacion_codigo || ""),
    );
};

export default function Montacarguista() {
  const [listas, setListas] = useState([]);
  const [listaActiva, setListaActiva] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const [estibas, setEstibas] = useState([]);
  const [estibaActiva, setEstibaActiva] = useState("");
  const [showEstibaForm, setShowEstibaForm] = useState(false);
  const [nombreEstiba, setNombreEstiba] = useState("");
  const [fotoEstiba, setFotoEstiba] = useState("");

  const cargarListas = async () => {
    try {
      const { data } = await api.get("/api/picking/mis-listas");
      setListas(data);
    } catch (err) {
      console.error(err);
    }
  };

  const cargarEstibas = async () => {
    try {
      const { data } = await api.get("/api/picking/estibas");
      setEstibas(data);
      if (data.length > 0 && !estibaActiva) setEstibaActiva(data[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarListas();
    cargarEstibas();
    // Solo al montar: las funciones se redefinen cada render; no van en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3000);
  };

  // Redimensiona la foto a ~640px para no guardar imágenes enormes.
  const onFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setFotoEstiba(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const registrarEstiba = async () => {
    if (!nombreEstiba.trim()) {
      mostrarMensaje("El nombre de la estiba es obligatorio", "error");
      return;
    }
    if (!fotoEstiba) {
      mostrarMensaje("La foto de la estiba es obligatoria", "error");
      return;
    }
    setCargando(true);
    try {
      const { data } = await api.post("/api/picking/estibas", {
        nombre: nombreEstiba.trim(),
        foto_url: fotoEstiba,
      });
      mostrarMensaje("✓ Estiba registrada");
      setNombreEstiba("");
      setFotoEstiba("");
      setShowEstibaForm(false);
      await cargarEstibas();
      if (data?.data?.id) setEstibaActiva(data.data.id);
    } catch (err) {
      mostrarMensaje(err.response?.data?.error || "Error al registrar", "error");
    } finally {
      setCargando(false);
    }
  };

  const abrirLista = (lista) => {
    setListaActiva(lista);
    setVista("barrido");
  };

  const recargarListaActiva = async () => {
    const { data } = await api.get("/api/picking/mis-listas");
    setListas(data);
    const listaActualizada = data.find((l) => l.id === listaActiva?.id);
    if (listaActualizada) setListaActiva(listaActualizada);
  };

  // Baja todas las cajas pendientes de un grupo consolidado (misma referencia +
  // ubicación, posiblemente de varios pedidos) con un solo escaneo. El backend
  // re-verifica la referencia de cada ítem antes de descontar inventario.
  const bajarGrupo = async (grupo, referenciaEscaneada) => {
    if (!estibaActiva) {
      mostrarMensaje("Registra o selecciona una estiba antes de bajar", "error");
      return;
    }
    setCargando(true);
    try {
      for (const it of grupo.pendientes) {
        await api.patch(`/api/picking/items/${it.id}/bajar`, {
          estiba_id: estibaActiva,
          referencia_escaneada: referenciaEscaneada,
        });
      }
      const n = grupo.pendientes.length;
      mostrarMensaje(
        `✓ ${n} caja${n !== 1 ? "s" : ""} de ${grupo.referencia} verificada${n !== 1 ? "s" : ""} y bajada${n !== 1 ? "s" : ""}`,
      );
    } catch (err) {
      mostrarMensaje(err.response?.data?.error || "Error al registrar", "error");
    } finally {
      await recargarListaActiva();
      setCargando(false);
    }
  };

  // El escaneo es el disparador de la bajada: cruza la referencia leída contra
  // los grupos pendientes (consolidados) de la lista. La verificación definitiva
  // la hace el backend (no se puede saltar manipulando el frontend).
  const onEscanear = async (refEscaneada) => {
    if (!estibaActiva) {
      mostrarMensaje("Registra o selecciona una estiba antes de bajar", "error");
      return;
    }
    const norm = refEscaneada.trim().toUpperCase();
    const grupos = consolidarItems(listaActiva?.lista_picking_items);
    const objetivo = grupos.find(
      (g) =>
        (g.referencia || "").trim().toUpperCase() === norm &&
        g.pendientes.length > 0,
    );
    if (!objetivo) {
      mostrarMensaje(
        `Caja incorrecta: ${norm} no pertenece a esta lista o ya fue bajada`,
        "error",
      );
      return;
    }
    await bajarGrupo(objetivo, refEscaneada);
  };

  return (
    <Layout
      titulo="Mis Listas"
      subtitulo={
        vista === "lista"
          ? `${listas.length} lista${listas.length !== 1 ? "s" : ""} asignada${listas.length !== 1 ? "s" : ""}`
          : `${listaActiva?.bodegas?.nombre} — ${listaActiva?.lista_picking_items?.length} ítems`
      }
    >
      {vista !== "lista" && (
        <button
          onClick={() => setVista("lista")}
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
            display: "block",
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
        <div>
          {listas.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📦</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No tienes listas asignadas
              </p>
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                El administrador te asignará una lista cuando haya pedidos
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {listas.map((lista) => {
                const total = lista.lista_picking_items?.length || 0;
                const bajadas =
                  lista.lista_picking_items?.filter(
                    (i) => i.estado !== "pendiente",
                  ).length || 0;
                const porcentaje =
                  total > 0 ? Math.round((bajadas / total) * 100) : 0;
                return (
                  <div
                    key={lista.id}
                    onClick={() => abrirLista(lista)}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#00FF87";
                      e.currentTarget.style.boxShadow =
                        "0 0 0 3px rgba(0,255,135,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#E8E8E8";
                      e.currentTarget.style.boxShadow = "none";
                    }}
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
                            fontFamily: "Bebas Neue, sans-serif",
                            fontSize: "22px",
                            letterSpacing: "0.04em",
                            color: "#0A0A0A",
                          }}
                        >
                          {lista.bodegas?.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#888",
                            marginTop: "4px",
                          }}
                        >
                          {total} ítems ·{" "}
                          {lista.lista_picking_items?.reduce(
                            (a, i) => a + (i.cantidad_cajas || 0),
                            0,
                          )}{" "}
                          cajas
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontFamily: "Bebas Neue, sans-serif",
                            fontSize: "28px",
                            color: porcentaje === 100 ? "#00CC6A" : "#0A0A0A",
                          }}
                        >
                          {porcentaje}%
                        </div>
                        <div style={{ fontSize: "12px", color: "#888" }}>
                          {bajadas}/{total} bajadas
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
                          width: `${porcentaje}%`,
                          borderRadius: "4px",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {vista === "barrido" && listaActiva && (
        <div>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", color: "#888" }}>
                Progreso del barrido
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
                {
                  listaActiva.lista_picking_items?.filter(
                    (i) => i.estado !== "pendiente",
                  ).length
                }{" "}
                / {listaActiva.lista_picking_items?.length} cajas
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
                  color: "#0A0A0A",
                }}
              >
                {Math.round(
                  ((listaActiva.lista_picking_items?.filter(
                    (i) => i.estado !== "pendiente",
                  ).length || 0) /
                    (listaActiva.lista_picking_items?.length || 1)) *
                    100,
                )}
                %
              </div>
            </div>
          </div>

          {/* Barra de estiba: foto obligatoria para registrar (railguard) */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A" }}>
                📦 Estiba activa:
              </span>
              <select
                value={estibaActiva}
                onChange={(e) => setEstibaActiva(e.target.value)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #E8E8E8",
                  borderRadius: "8px",
                  fontSize: "13px",
                  flex: 1,
                  minWidth: "140px",
                }}
              >
                <option value="">— Selecciona —</option>
                {estibas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowEstibaForm((v) => !v)}
                style={{
                  background: "transparent",
                  color: "#0A0A0A",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showEstibaForm ? "Cancelar" : "+ Registrar estiba"}
              </button>
            </div>

            {showEstibaForm && (
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
                <input
                  value={nombreEstiba}
                  onChange={(e) => setNombreEstiba(e.target.value)}
                  placeholder="Nombre / número de la estiba"
                  style={{
                    padding: "9px 12px",
                    border: "1px solid #E8E8E8",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                />
                <label style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}>
                  Foto de la estiba (obligatoria)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFoto}
                  style={{ fontSize: "13px" }}
                />
                {fotoEstiba && (
                  <img
                    src={fotoEstiba}
                    alt="estiba"
                    style={{
                      width: "120px",
                      height: "120px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      border: "1px solid #E8E8E8",
                    }}
                  />
                )}
                <button
                  onClick={registrarEstiba}
                  disabled={cargando}
                  style={{
                    background: "#0A0A0A",
                    color: "#00FF87",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  Guardar estiba
                </button>
              </div>
            )}
          </div>

          <ScanInput
            onScan={onEscanear}
            disabled={cargando}
            label="Escanea la caja antes de bajarla"
            hint="Verifica que la referencia coincide con la lista antes de descontar inventario"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {consolidarItems(listaActiva.lista_picking_items).map((grupo) => {
              const bajada = grupo.bajada;
              const cajasBajadas = grupo.cajas_total - grupo.pendientes.reduce(
                (a, i) => a + (i.cantidad_cajas || 0),
                0,
              );
              return (
                <div
                  key={grupo.key}
                  style={{
                    background: bajada ? "rgba(0,255,135,0.04)" : "#FFFFFF",
                    border: bajada
                      ? "1px solid rgba(0,255,135,0.2)"
                      : "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                    opacity: bajada ? 0.7 : 1,
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            background: "#0A0A0A",
                            color: "#00FF87",
                            padding: "3px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontFamily: "DM Mono, monospace",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                          }}
                        >
                          {grupo.ubicacion_codigo || "Sin ubic."}
                        </span>
                        {grupo.destino_saldos && (
                          <span
                            style={{
                              background: "#FEF9C3",
                              color: "#854D0E",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            → SALDOS
                          </span>
                        )}
                        {grupo.pedidos.length > 1 && (
                          <span
                            style={{
                              background: "#EEF2FF",
                              color: "#3730A3",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {grupo.pedidos.length} pedidos
                          </span>
                        )}
                        <span
                          style={{
                            background: bajada
                              ? "rgba(0,255,135,0.1)"
                              : "#F3F4F6",
                            color: bajada ? "#007A40" : "#374151",
                            padding: "2px 8px",
                            borderRadius: "20px",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {bajada
                            ? "✓ Bajada"
                            : cajasBajadas > 0
                              ? `${cajasBajadas}/${grupo.cajas_total} bajadas`
                              : "Pendiente"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#0A0A0A",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {grupo.descripcion}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#888",
                          fontFamily: "DM Mono, monospace",
                          marginTop: "3px",
                        }}
                      >
                        Ref: {grupo.referencia} · Pedido
                        {grupo.pedidos.length !== 1 ? "s" : ""}:{" "}
                        {grupo.pedidos.join(", ") || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          fontFamily: "DM Mono, monospace",
                          color: "#0A0A0A",
                        }}
                      >
                        {grupo.cajas_total}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#888",
                          marginBottom: bajada ? 0 : "8px",
                        }}
                      >
                        {grupo.cajas_total === 1 ? "caja" : "cajas"}
                      </div>
                      {!bajada && (
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#854D0E",
                            background: "#FEF9C3",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            minWidth: "80px",
                          }}
                        >
                          Escanea para bajar
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Layout>
  );
}
