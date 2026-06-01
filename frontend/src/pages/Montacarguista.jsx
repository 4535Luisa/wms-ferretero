import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import api from "../services/api";

export default function Montacarguista() {
  const { usuario } = useAuth();
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

  useEffect(() => {
    cargarListas();
    cargarEstibas();
  }, []);

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

  const marcarBajada = async (itemId) => {
    if (!estibaActiva) {
      mostrarMensaje("Registra o selecciona una estiba antes de bajar", "error");
      return;
    }
    setCargando(true);
    try {
      await api.patch(`/api/picking/items/${itemId}/bajar`, {
        estiba_id: estibaActiva,
      });
      mostrarMensaje("✓ Caja registrada como bajada — inventario actualizado");
      const { data } = await api.get("/api/picking/mis-listas");
      setListas(data);
      const listaActualizada = data.find((l) => l.id === listaActiva?.id);
      if (listaActualizada) setListaActiva(listaActualizada);
    } catch (err) {
      mostrarMensaje(err.response?.data?.error || "Error al registrar", "error");
    } finally {
      setCargando(false);
    }
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

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(listaActiva.lista_picking_items || [])
              .sort((a, b) =>
                (a.ubicacion_codigo || "").localeCompare(
                  b.ubicacion_codigo || "",
                ),
              )
              .map((item) => {
                const bajada = item.estado !== "pendiente";
                return (
                  <div
                    key={item.id}
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
                            {item.ubicacion_codigo || "Sin ubic."}
                          </span>
                          {item.destino_saldos && (
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
                            {bajada ? "✓ Bajada" : "Pendiente"}
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
                          {item.descripcion}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#888",
                            fontFamily: "DM Mono, monospace",
                            marginTop: "3px",
                          }}
                        >
                          Ref: {item.referencia} · Pedido:{" "}
                          {item.pedidos?.numero}
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
                          {item.cantidad_cajas}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#888",
                            marginBottom: "8px",
                          }}
                        >
                          {item.cantidad_cajas === 1 ? "caja" : "cajas"}
                        </div>
                        {!bajada && (
                          <button
                            onClick={() => marcarBajada(item.id)}
                            disabled={cargando}
                            style={{
                              background: "#00FF87",
                              color: "#0A0A0A",
                              border: "none",
                              borderRadius: "8px",
                              padding: "10px 16px",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                              minHeight: "44px",
                              minWidth: "80px",
                              display: "block",
                            }}
                          >
                            Bajar ↓
                          </button>
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
