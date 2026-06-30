import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
import api from "../services/api";

// Ordena ubicaciones siguiendo la lógica física de la bodega:
// Letra = piso (a=1, b=2, c=3...)
// Número después de la letra = estantería (a1, a2, a3...)
// Número después del guion = posición en la estantería (a1-1, a1-2...)
// Ejemplo correcto: a1-1 → a1-2 → a1-3 → a2-1 → b1-1
const parsearUbicacion = (codigo) => {
  if (!codigo) return { piso: "z", estanteria: 999, posicion: 999 };
  const match = codigo.toLowerCase().match(/^([a-z]+)(\d+)(?:-(\d+))?/);
  if (!match) return { piso: codigo, estanteria: 0, posicion: 0 };
  return {
    piso: match[1],
    estanteria: parseInt(match[2]) || 0,
    posicion: parseInt(match[3]) || 0,
  };
};

const compararUbicaciones = (a, b) => {
  const ua = parsearUbicacion(a.ubicacion_codigo);
  const ub = parsearUbicacion(b.ubicacion_codigo);
  if (ua.piso !== ub.piso) return ua.piso.localeCompare(ub.piso);
  if (ua.estanteria !== ub.estanteria) return ua.estanteria - ub.estanteria;
  return ua.posicion - ub.posicion;
};

// Consolida ítems por referencia + ubicación.
// Cajas pendientes siempre antes que las bajadas.
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
      // Pendientes siempre primero, bajadas al final
      if (a.bajada !== b.bajada) return a.bajada ? 1 : -1;
      // Dentro de cada grupo, ordenar por ubicación física
      return compararUbicaciones(a, b);
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
    cargarListas();
    cargarEstibas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detectar ruta para mostrar estibas desde el menú
  useEffect(() => {
    if (location.pathname === "/montacarguista/estibas") {
      setVista("estibas");
    } else if (location.pathname === "/montacarguista") {
      setVista("lista");
    }
  }, [location.pathname]);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3000);
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
      mostrarMensaje(
        err.response?.data?.error || "Error al registrar",
        "error",
      );
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

  const bajarGrupo = async (grupo, referenciaEscaneada) => {
    if (!estibaActiva) {
      mostrarMensaje(
        "Registra o selecciona una estiba antes de bajar",
        "error",
      );
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
      mostrarMensaje(
        err.response?.data?.error || "Error al registrar",
        "error",
      );
    } finally {
      await recargarListaActiva();
      setCargando(false);
    }
  };

  const onEscanear = async (refEscaneada) => {
    if (!estibaActiva) {
      mostrarMensaje(
        "Registra o selecciona una estiba antes de bajar",
        "error",
      );
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

  const tabStyle = (activo) => ({
    padding: "8px 16px",
    borderRadius: "7px",
    border: "none",
    background: activo ? "#FFFFFF" : "transparent",
    color: "#0A0A0A",
    fontFamily: "Outfit, sans-serif",
    fontSize: "13px",
    fontWeight: activo ? 700 : 400,
    cursor: "pointer",
    boxShadow: activo ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
  });

  return (
    <Layout
      titulo={vista === "estibas" ? "Mis Estibas" : "Mis Listas"}
      subtitulo={
        vista === "lista"
          ? `${listas.length} lista${listas.length !== 1 ? "s" : ""} asignada${listas.length !== 1 ? "s" : ""}`
          : vista === "estibas"
            ? `${estibas.length} estiba${estibas.length !== 1 ? "s" : ""} activa${estibas.length !== 1 ? "s" : ""}`
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
          <button
            style={tabStyle(vista === "lista")}
            onClick={() => setVista("lista")}
          >
            📦 Mis listas
          </button>
          <button
            style={tabStyle(vista === "estibas")}
            onClick={() => setVista("estibas")}
          >
            🪵 Estibas ({estibas.length})
          </button>
        </div>
      )}

      {vista === "barrido" && (
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

      {/* VISTA: MIS LISTAS */}
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

      {/* VISTA: ESTIBAS */}
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
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#0A0A0A",
                  margin: 0,
                }}
              >
                Nueva estiba
              </p>
              <input
                value={nombreEstiba}
                onChange={(e) => setNombreEstiba(e.target.value)}
                placeholder="Nombre o número de la estiba"
                style={{
                  padding: "10px 12px",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontFamily: "Outfit, sans-serif",
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
                  cursor: cargando ? "not-allowed" : "pointer",
                  fontFamily: "Outfit, sans-serif",
                  alignSelf: "flex-start",
                  opacity: cargando ? 0.6 : 1,
                }}
              >
                {cargando ? "Guardando..." : "Guardar estiba"}
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
              <p style={{ fontSize: "13px", color: "#BBB", marginTop: "4px" }}>
                Registra una estiba antes de empezar el barrido
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {estibas.map((e) => (
                <div
                  key={e.id}
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
                  onClick={() => setEstibaActiva(e.id)}
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
                          border: "1px solid #E8E8E8",
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

      {/* VISTA: BARRIDO */}
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

          {/* Selector de estiba */}
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
                  fontFamily: "Outfit, sans-serif",
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
                onClick={() => setVista("estibas")}
                style={{
                  background: "transparent",
                  color: "#0A0A0A",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                + Nueva estiba
              </button>
            </div>
          </div>

          {/* Scanner */}
          <ScanInput
            onScan={onEscanear}
            disabled={cargando}
            label="Escanea o digita la referencia de la caja"
            hint="La caja bajará automáticamente al verificarse — orden por ubicación física"
          />

          {/* Lista de ítems — pendientes primero, bajadas al final */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {consolidarItems(listaActiva.lista_picking_items).map((grupo) => {
              const bajada = grupo.bajada;
              const cajasBajadas =
                grupo.cajas_total -
                grupo.pendientes.reduce(
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
                    opacity: bajada ? 0.65 : 1,
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
