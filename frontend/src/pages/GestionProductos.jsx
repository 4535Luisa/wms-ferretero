import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
import api from "../services/api";

export default function GestionProductos() {
  const [productos, setProductos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [modo, setModo] = useState("lista");
  const [editando, setEditando] = useState({
    ean14: "",
    sin_codigo_barras: false,
  });
  const [nuevoProducto, setNuevoProducto] = useState({
    codigo_interno: "",
    descripcion_corta: "",
    unidad_empaque: "",
  });
  const [vistaCrear, setVistaCrear] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/api/productos");
      setProductos(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const abrirProducto = (p) => {
    setSeleccionado(p);
    setEditando({
      ean14: p.ean14 || "",
      sin_codigo_barras: p.sin_codigo_barras || false,
    });
    setModo("detalle");
    setEscaneando(false);
  };

  const guardar = async () => {
    if (!seleccionado) return;
    if (
      !editando.sin_codigo_barras &&
      editando.ean14 &&
      editando.ean14.length !== 14
    ) {
      aviso("El EAN14 debe tener exactamente 14 digitos", "error");
      return;
    }
    setCargando(true);
    try {
      await api.patch(`/api/productos/${seleccionado.id}/codigo-barras`, {
        ean14: editando.ean14 || null,
        sin_codigo_barras: editando.sin_codigo_barras,
      });
      aviso("Codigo de barras actualizado correctamente");
      await cargar();
      setModo("lista");
    } catch (err) {
      aviso(err.response?.data?.error || "Error al guardar", "error");
    } finally {
      setCargando(false);
    }
  };

  const crearProducto = async () => {
    if (!nuevoProducto.codigo_interno.trim()) {
      aviso("El codigo interno es obligatorio", "error");
      return;
    }
    if (!nuevoProducto.descripcion_corta.trim()) {
      aviso("La descripcion es obligatoria", "error");
      return;
    }
    if (
      !nuevoProducto.unidad_empaque ||
      Number(nuevoProducto.unidad_empaque) < 1
    ) {
      aviso("La unidad de empaque debe ser mayor a 0", "error");
      return;
    }
    setCargando(true);
    try {
      await api.post("/api/productos/crear", {
        codigo_interno: nuevoProducto.codigo_interno.trim(),
        descripcion_corta: nuevoProducto.descripcion_corta.trim(),
        unidad_empaque: Number(nuevoProducto.unidad_empaque),
      });
      aviso("Producto creado correctamente");
      setNuevoProducto({
        codigo_interno: "",
        descripcion_corta: "",
        unidad_empaque: "",
      });
      setVistaCrear(false);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al crear el producto", "error");
    } finally {
      setCargando(false);
    }
  };

  const onEscanear = (codigo) => {
    let cb = codigo
      .trim()
      .replace(/^\(01\)/, "")
      .replace(/^01(\d{14})$/, "$1");
    setEditando((e) => ({ ...e, ean14: cb, sin_codigo_barras: false }));
    setEscaneando(false);
    aviso(`Codigo capturado: ${cb}`);
  };

  const filtrado = productos.filter((p) => {
    const f = filtro.toLowerCase();
    return (
      !f ||
      (p.codigo_interno || "").toLowerCase().includes(f) ||
      (p.descripcion_corta || "").toLowerCase().includes(f)
    );
  });

  const clsAbc = (abc) => {
    const m = {
      A: { bg: "#FEE2E2", fg: "#991B1B" },
      B: { bg: "#FEF9C3", fg: "#854D0E" },
      C: { bg: "#F0F0F0", fg: "#374151" },
    };
    const c = m[abc] || m.C;
    return (
      <span
        style={{
          background: c.bg,
          color: c.fg,
          padding: "2px 8px",
          borderRadius: "20px",
          fontSize: "10px",
          fontWeight: 700,
        }}
      >
        {abc || "—"}
      </span>
    );
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    fontSize: "14px",
    boxSizing: "border-box",
    fontFamily: "Outfit, sans-serif",
  };

  return (
    <Layout
      titulo="Productos"
      subtitulo={
        modo === "lista"
          ? `${filtrado.length} referencias`
          : seleccionado?.codigo_interno
      }
    >
      {modo === "detalle" && (
        <button
          onClick={() => setModo("lista")}
          style={{
            background: "transparent",
            border: "1.5px solid #E8E8E8",
            borderRadius: "8px",
            padding: "9px 18px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
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
              mensaje.tipo === "error" ? "#FEE2E2" : "rgba(0,200,100,0.08)",
            color: mensaje.tipo === "error" ? "#991B1B" : "#007A40",
            border: `1px solid ${mensaje.tipo === "error" ? "#FECACA" : "rgba(0,200,100,0.2)"}`,
          }}
        >
          {mensaje.texto}
        </div>
      )}

      {modo === "lista" && (
        <div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por referencia o descripcion..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => setVistaCrear((v) => !v)}
              style={{
                background: "#0A0A0A",
                color: "#00FF87",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {vistaCrear ? "Cancelar" : "Nuevo producto"}
            </button>
          </div>

          {vistaCrear && (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.5rem",
                marginBottom: "1rem",
              }}
            >
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  margin: "0 0 16px 0",
                }}
              >
                Crear producto nuevo
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#666",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Codigo interno SIESA *
                  </label>
                  <input
                    value={nuevoProducto.codigo_interno}
                    onChange={(e) =>
                      setNuevoProducto((p) => ({
                        ...p,
                        codigo_interno: e.target.value,
                      }))
                    }
                    placeholder="Ej: 120390"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#666",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Descripcion *
                  </label>
                  <input
                    value={nuevoProducto.descripcion_corta}
                    onChange={(e) =>
                      setNuevoProducto((p) => ({
                        ...p,
                        descripcion_corta: e.target.value,
                      }))
                    }
                    placeholder="Ej: ROD F 4 PVNA NARANJA MACHO"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#666",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Unidad de empaque (unidades por caja) *
                  </label>
                  <input
                    type="number"
                    value={nuevoProducto.unidad_empaque}
                    onChange={(e) =>
                      setNuevoProducto((p) => ({
                        ...p,
                        unidad_empaque: e.target.value,
                      }))
                    }
                    placeholder="Ej: 24"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={crearProducto}
                  disabled={cargando}
                  style={{
                    background: "#00FF87",
                    color: "#0A0A0A",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {cargando ? "Creando..." : "Crear producto"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filtrado.slice(0, 100).map((p) => (
              <div
                key={p.id}
                onClick={() => abrirProducto(p)}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E8",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "#0A0A0A")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "#E8E8E8")
                }
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "3px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "DM Mono, monospace",
                        fontWeight: 700,
                        fontSize: "13px",
                      }}
                    >
                      {p.codigo_interno}
                    </span>
                    {clsAbc(p.clasificacion_abc)}
                    {p.sin_codigo_barras && (
                      <span
                        style={{
                          background: "#FEE2E2",
                          color: "#991B1B",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        Sin codigo
                      </span>
                    )}
                    {p.ean14 && (
                      <span
                        style={{
                          background: "rgba(0,200,100,0.1)",
                          color: "#007A40",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        EAN14
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#374151",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.descripcion_corta}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#888",
                      marginTop: "2px",
                      fontFamily: "DM Mono, monospace",
                    }}
                  >
                    UE: {p.unidad_empaque || "—"}{" "}
                    {p.ean14 ? `· EAN14: ${p.ean14}` : ""}
                  </div>
                </div>
                <span style={{ color: "#CCC", fontSize: "18px" }}>›</span>
              </div>
            ))}
            {filtrado.length > 100 && (
              <p
                style={{ textAlign: "center", color: "#888", fontSize: "13px" }}
              >
                Mostrando 100 de {filtrado.length} — use el filtro para buscar
              </p>
            )}
          </div>
        </div>
      )}

      {modo === "detalle" && seleccionado && (
        <div style={{ maxWidth: "560px" }}>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontWeight: 700,
                  fontSize: "18px",
                }}
              >
                {seleccionado.codigo_interno}
              </span>
              {clsAbc(seleccionado.clasificacion_abc)}
            </div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#0A0A0A",
                marginBottom: "4px",
              }}
            >
              {seleccionado.descripcion_corta}
            </div>
            <div style={{ fontSize: "13px", color: "#888" }}>
              Unidad de empaque: {seleccionado.unidad_empaque || "—"} unidades
              por caja
            </div>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#0A0A0A",
                margin: "0 0 16px 0",
              }}
            >
              Codigo de barras caja master (EAN14)
            </h3>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "16px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={editando.sin_codigo_barras}
                onChange={(e) =>
                  setEditando((ed) => ({
                    ...ed,
                    sin_codigo_barras: e.target.checked,
                    ean14: e.target.checked ? "" : ed.ean14,
                  }))
                }
                style={{ width: "18px", height: "18px" }}
              />
              <span style={{ fontSize: "14px", color: "#374151" }}>
                No aplica — se baja manual
              </span>
            </label>

            {!editando.sin_codigo_barras && (
              <>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#666",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  EAN14 (14 digitos)
                </label>
                <div
                  style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
                >
                  <input
                    value={editando.ean14}
                    onChange={(e) =>
                      setEditando((ed) => ({
                        ...ed,
                        ean14: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="Ej: 17709898161151"
                    maxLength={14}
                    style={{
                      ...inputStyle,
                      flex: 1,
                      fontFamily: "DM Mono, monospace",
                    }}
                  />
                  <button
                    onClick={() => setEscaneando((v) => !v)}
                    style={{
                      background: "#0A0A0A",
                      color: "#00FF87",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {escaneando ? "Cancelar" : "Escanear"}
                  </button>
                </div>

                {escaneando && (
                  <ScanInput
                    onScan={onEscanear}
                    label="Escanea el codigo de barras de la caja"
                    hint="El sistema elimina automaticamente el prefijo GS1 (01)"
                  />
                )}

                {editando.ean14.length === 14 && (
                  <div
                    style={{
                      background: "rgba(0,200,100,0.08)",
                      border: "1px solid rgba(0,200,100,0.2)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      color: "#007A40",
                    }}
                  >
                    EAN14 valido — 14 digitos
                  </div>
                )}
                {editando.ean14.length > 0 && editando.ean14.length !== 14 && (
                  <div
                    style={{
                      background: "#FEE2E2",
                      border: "1px solid #FECACA",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      color: "#991B1B",
                    }}
                  >
                    El EAN14 debe tener 14 digitos — actualmente tiene{" "}
                    {editando.ean14.length}
                  </div>
                )}
              </>
            )}

            <button
              onClick={guardar}
              disabled={
                cargando ||
                (!editando.sin_codigo_barras &&
                  editando.ean14.length > 0 &&
                  editando.ean14.length !== 14)
              }
              style={{
                width: "100%",
                marginTop: "16px",
                background: "#0A0A0A",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                opacity: cargando ? 0.6 : 1,
              }}
            >
              {cargando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
