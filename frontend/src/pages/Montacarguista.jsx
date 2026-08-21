import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Layout from "../components/Layout";
import ScanInput, { bip } from "../components/ScanInput";
import api from "../services/api";

// Parsea ubicación física: letra=piso, número=estantería, -N=posición
const parsearUbicacion = (codigo) => {
  if (!codigo) return { piso: "z", estanteria: 999, posicion: 999 };
  const m = codigo.toLowerCase().match(/^([a-z]+)(\d+)(?:-(\d+))?/);
  if (!m) return { piso: codigo, estanteria: 0, posicion: 0 };
  return {
    piso: m[1],
    estanteria: parseInt(m[2]) || 0,
    posicion: parseInt(m[3]) || 0,
  };
};

// Detecta si el código escaneado es una ubicación (ej: "UB-a1-1") o EAN de producto
const esCodigoUbicacion = (codigo) => /^UB-/i.test(codigo.trim());
const extraerUbicacion = (codigo) =>
  codigo.trim().replace(/^UB-/i, "").toUpperCase();

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
    .sort((a, b) => {
      if (a.bajada !== b.bajada) return a.bajada ? 1 : -1;
      const ua = parsearUbicacion(a.ubicacion_codigo);
      const ub = parsearUbicacion(b.ubicacion_codigo);
      if (ua.piso !== ub.piso) return ua.piso.localeCompare(ub.piso);
      if (ua.estanteria !== ub.estanteria) return ua.estanteria - ub.estanteria;
      return ua.posicion - ub.posicion;
    });
};

export default function Montacarguista() {
  const location = useLocation();
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

  // Ubicación activa: cuando el montacarguista escanea una ubicación queda
  // "bloqueada" hasta que termine todas las cajas de esa ubicación.
  const [ubicacionActiva, setUbicacionActiva] = useState(null);

  useEffect(() => {
    cargarListas();
    cargarEstibas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (location.pathname === "/montacarguista/estibas") setVista("estibas");
    else if (location.pathname === "/montacarguista") setVista("lista");
  }, [location.pathname]);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3000);
  };

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
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        setFotoEstiba(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const registrarEstiba = async () => {
    if (!nombreEstiba.trim()) {
      mostrarMensaje("Nombre de estiba obligatorio", "error");
      return;
    }
    if (!fotoEstiba) {
      mostrarMensaje("Foto de estiba obligatoria", "error");
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
      mostrarMensaje(
        err.response?.data?.error || "Error al registrar",
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const recargarListaActiva = async () => {
    const { data } = await api.get("/api/picking/mis-listas");
    setListas(data);
    const act = data.find((l) => l.id === listaActiva?.id);
    if (act) setListaActiva(act);
  };

  const bajarUnaCaja = async (grupo, referenciaEscaneada, metodo) => {
    if (!estibaActiva) {
      bip("error");
      mostrarMensaje(
        "Registra o selecciona una estiba antes de bajar",
        "error",
      );
      return;
    }
    if (grupo.pendientes.length === 0) return;
    const it = grupo.pendientes[0];
    setCargando(true);
    try {
      await api.patch(`/api/picking/items/${it.id}/bajar`, {
        estiba_id: estibaActiva,
        referencia_escaneada: referenciaEscaneada,
        metodo: metodo || "teclado",
      });
      bip("ok");
      const restantes = grupo.pendientes.length - 1;
      // Si quedan más cajas en esta ubicación, mantener ubicación activa
      if (restantes === 0) setUbicacionActiva(null);
      mostrarMensaje(
        restantes > 0
          ? `✓ Caja bajada — faltan ${restantes} caja${restantes !== 1 ? "s" : ""} en ${grupo.ubicacion_codigo}`
          : `✓ Todas las cajas de ${grupo.referencia} bajadas`,
      );
    } catch (err) {
      bip("error");
      mostrarMensaje(
        err.response?.data?.error || "Error al registrar",
        "error",
      );
    } finally {
      await recargarListaActiva();
      setCargando(false);
    }
  };

  // Flujo de escaneo:
  // 1. Si escanea una UBICACIÓN → la activa y muestra qué hay en ella
  // 2. Si escanea una CAJA → verifica que corresponde a la ubicación activa
  const onEscanear = async (escaneado, origen) => {
    if (!estibaActiva) {
      bip("error");
      mostrarMensaje(
        "Registra o selecciona una estiba antes de bajar",
        "error",
      );
      return;
    }

    const norm = escaneado.trim().toUpperCase();

    // ¿Es un código de ubicación? (formato: UB-a1-1)
    if (esCodigoUbicacion(norm)) {
      const codigoUb = extraerUbicacion(norm);
      const grupos = consolidarItems(listaActiva?.lista_picking_items);
      const enEstaUbicacion = grupos.filter(
        (g) =>
          (g.ubicacion_codigo || "").toUpperCase() === codigoUb &&
          g.pendientes.length > 0,
      );
      if (enEstaUbicacion.length === 0) {
        bip("error");
        mostrarMensaje(
          `⚠ La ubicación ${codigoUb} no tiene cajas pendientes en esta lista`,
          "error",
        );
        return;
      }
      bip("ok");
      setUbicacionActiva(codigoUb);
      const totalCajas = enEstaUbicacion.reduce(
        (a, g) => a + g.pendientes.length,
        0,
      );
      mostrarMensaje(
        `📍 Ubicación ${codigoUb} activa — ${totalCajas} caja${totalCajas !== 1 ? "s" : ""} pendiente${totalCajas !== 1 ? "s" : ""}`,
      );
      return;
    }

    // Es un código de caja — resolver EAN-13 si aplica
    let codigoResuelto = norm;
    if (/^\d{8,14}$/.test(norm)) {
      try {
        const { data } = await api.get(
          `/api/productos/buscar-barras?codigo_barras=${norm}`,
        );
        if (data?.codigo_interno)
          codigoResuelto = data.codigo_interno.trim().toUpperCase();
      } catch {
        /* best-effort */
      }
    }

    const grupos = consolidarItems(listaActiva?.lista_picking_items);

    // Si hay ubicación activa, verificar que la caja pertenece a esa ubicación
    let objetivo;
    if (ubicacionActiva) {
      objetivo = grupos.find(
        (g) =>
          (g.referencia || "").trim().toUpperCase() === codigoResuelto &&
          (g.ubicacion_codigo || "").toUpperCase() === ubicacionActiva &&
          g.pendientes.length > 0,
      );
      if (!objetivo) {
        // Puede ser que la caja esté en la lista pero en otra ubicación
        const enOtraUbicacion = grupos.find(
          (g) =>
            (g.referencia || "").trim().toUpperCase() === codigoResuelto &&
            g.pendientes.length > 0,
        );
        if (enOtraUbicacion) {
          bip("error");
          mostrarMensaje(
            `⚠ Esta caja (${codigoResuelto}) pertenece a la ubicación ${enOtraUbicacion.ubicacion_codigo}, no a ${ubicacionActiva}`,
            "error",
          );
        } else {
          bip("error");
          mostrarMensaje(
            `⚠ CAJA NO ENCONTRADA: ${codigoResuelto} no está en esta lista o ya fue bajada`,
            "error",
          );
        }
        return;
      }
    } else {
      // Sin ubicación activa — buscar en toda la lista
      objetivo = grupos.find(
        (g) =>
          (g.referencia || "").trim().toUpperCase() === codigoResuelto &&
          g.pendientes.length > 0,
      );
      if (!objetivo) {
        bip("error");
        mostrarMensaje(
          `⚠ CAJA NO ENCONTRADA: ${codigoResuelto} no está en esta lista o ya fue bajada`,
          "error",
        );
        return;
      }
      // Sugerencia: escanear la ubicación primero
      mostrarMensaje(
        `💡 Tip: escanea primero la etiqueta de la ubicación ${objetivo.ubicacion_codigo} para mayor precisión`,
      );
    }

    const metodo = origen === "camara" ? "camara" : "teclado";
    await bajarUnaCaja(objetivo, escaneado, metodo);
  };

  const btn = (txt, onClick, opts = {}) => (
    <button
      onClick={onClick}
      style={{
        background: opts.bg || "transparent",
        color: opts.color || "#0A0A0A",
        border: opts.border || "1.5px solid #E8E8E8",
        borderRadius: "8px",
        padding: "9px 16px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "Outfit, sans-serif",
        minHeight: "44px",
        ...opts.style,
      }}
    >
      {txt}
    </button>
  );

  return (
    <Layout
      titulo="Mis Listas"
      subtitulo={
        vista === "lista"
          ? `${listas.length} lista${listas.length !== 1 ? "s" : ""} asignada${listas.length !== 1 ? "s" : ""}`
          : vista === "estibas"
            ? `${estibas.length} estiba${estibas.length !== 1 ? "s" : ""}`
            : `${listaActiva?.bodegas?.nombre} — ${listaActiva?.lista_picking_items?.length} ítems`
      }
    >
      {/* Tabs */}
      {vista !== "barrido" && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "1.25rem",
            background: "#F0F0F0",
            padding: "4px",
            borderRadius: "10px",
            width: "fit-content",
          }}
        >
          {[
            ["lista", "📦 Mis listas"],
            ["estibas", `🪵 Estibas (${estibas.length})`],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              style={{
                padding: "8px 16px",
                borderRadius: "7px",
                border: "none",
                background: vista === v ? "#FFFFFF" : "transparent",
                color: "#0A0A0A",
                fontFamily: "Outfit, sans-serif",
                fontSize: "13px",
                fontWeight: vista === v ? 700 : 400,
                cursor: "pointer",
                boxShadow: vista === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {vista === "barrido" &&
        btn(
          "← Volver",
          () => {
            setVista("lista");
            setUbicacionActiva(null);
          },
          { style: { marginBottom: "1.25rem", display: "block" } },
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

      {/* VISTA LISTA */}
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
                const pct = total > 0 ? Math.round((bajadas / total) * 100) : 0;
                return (
                  <div
                    key={lista.id}
                    onClick={() => {
                      setListaActiva(lista);
                      setVista("barrido");
                      setUbicacionActiva(null);
                    }}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E8E8E8",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      cursor: "pointer",
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
                            color: pct === 100 ? "#00CC6A" : "#0A0A0A",
                          }}
                        >
                          {pct}%
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
                          width: `${pct}%`,
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

      {/* VISTA ESTIBAS */}
      {vista === "estibas" && (
        <div>
          <button
            onClick={() => setShowEstibaForm((v) => !v)}
            style={{
              background: "#0A0A0A",
              color: "#00FF87",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
              marginBottom: "1rem",
            }}
          >
            {showEstibaForm ? "Cancelar" : "+ Registrar estiba"}
          </button>

          {showEstibaForm && (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <input
                value={nombreEstiba}
                onChange={(e) => setNombreEstiba(e.target.value)}
                placeholder="Nombre o número de la estiba"
                style={{
                  padding: "10px 12px",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  fontSize: "14px",
                }}
              />
              <label
                style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}
              >
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
                  background: "#00FF87",
                  color: "#0A0A0A",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Guardar estiba
              </button>
            </div>
          )}

          {estibas.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "3rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "1rem" }}>🪵</div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "#888" }}>
                No tienes estibas activas
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {estibas.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setEstibaActiva(e.id)}
                  style={{
                    background: "#FFFFFF",
                    border:
                      estibaActiva === e.id
                        ? "1.5px solid #00FF87"
                        : "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    cursor: "pointer",
                    boxShadow:
                      estibaActiva === e.id
                        ? "0 0 0 3px rgba(0,255,135,0.08)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    {e.foto_url && (
                      <img
                        src={e.foto_url}
                        alt={e.nombre}
                        style={{
                          width: "72px",
                          height: "72px",
                          objectFit: "cover",
                          borderRadius: "8px",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "15px",
                          color: "#0A0A0A",
                        }}
                      >
                        {e.nombre}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#888",
                          marginTop: "4px",
                        }}
                      >
                        {new Date(e.created_at).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {estibaActiva === e.id && (
                        <div
                          style={{
                            marginTop: "6px",
                            background: "rgba(0,255,135,0.1)",
                            color: "#007A40",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "20px",
                            display: "inline-block",
                          }}
                        >
                          ✓ Estiba activa
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA BARRIDO */}
      {vista === "barrido" && listaActiva && (
        <div>
          {/* Progreso */}
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

          {/* Ubicación activa */}
          {ubicacionActiva && (
            <div
              style={{
                background: "rgba(0,255,135,0.08)",
                border: "1.5px solid #00FF87",
                borderRadius: "12px",
                padding: "10px 16px",
                marginBottom: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#007A40",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Ubicación activa
                </div>
                <div
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#0A0A0A",
                  }}
                >
                  {ubicacionActiva}
                </div>
              </div>
              <button
                onClick={() => setUbicacionActiva(null)}
                style={{
                  background: "transparent",
                  border: "1px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  color: "#666",
                }}
              >
                Cambiar ubicación
              </button>
            </div>
          )}

          {/* Estiba */}
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
              <span
                style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A" }}
              >
                📦 Estiba:
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
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showEstibaForm ? "Cancelar" : "+ Nueva estiba"}
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
                <label
                  style={{ fontSize: "12px", color: "#666", fontWeight: 600 }}
                >
                  Foto (obligatoria)
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
            label={
              ubicacionActiva
                ? `Escanea caja en ${ubicacionActiva}`
                : "Escanea la etiqueta de la ubicación o la caja"
            }
            hint={
              ubicacionActiva
                ? "Escanea cada caja de esta ubicación — 1 escaneo = 1 caja"
                : "Primero escanea la ubicación (etiqueta UB-a1-1), luego las cajas"
            }
          />

          {/* Lista de ítems */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {consolidarItems(listaActiva.lista_picking_items).map((grupo) => {
              const bajada = grupo.bajada;
              const cajasBajadas =
                grupo.cajas_total -
                grupo.pendientes.reduce(
                  (a, i) => a + (i.cantidad_cajas || 0),
                  0,
                );
              const esUbicActiva =
                ubicacionActiva &&
                (grupo.ubicacion_codigo || "").toUpperCase() ===
                  ubicacionActiva;
              return (
                <div
                  key={grupo.key}
                  style={{
                    background: bajada
                      ? "rgba(0,255,135,0.04)"
                      : esUbicActiva
                        ? "rgba(0,255,135,0.08)"
                        : "#FFFFFF",
                    border: esUbicActiva
                      ? "1.5px solid #00FF87"
                      : bajada
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
                            background: bajada ? "#E8E8E8" : "#0A0A0A",
                            color: bajada ? "#888" : "#00FF87",
                            padding: "3px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontFamily: "DM Mono, monospace",
                            fontWeight: 700,
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
