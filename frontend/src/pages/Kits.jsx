import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import BuscadorProducto from "../components/BuscadorProducto";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

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
};

export default function Kits() {
  const { usuario } = useAuth();
  const esGerente = usuario?.rol === "gerente_logistico";

  const [kits, setKits] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  // Definir kit.
  const [kitProd, setKitProd] = useState(null);
  const [compProd, setCompProd] = useState(null);
  const [compCant, setCompCant] = useState("");
  const [componentes, setComponentes] = useState([]);

  // Acción por kit: bodega + cantidad (mapas por kit_producto_id).
  const [accion, setAccion] = useState({}); // { [kitId]: { bodega, cantidad } }

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargar = async () => {
    try {
      const [k, b] = await Promise.all([
        api.get("/api/kits"),
        api.get("/api/usuarios/bodegas"),
      ]);
      setKits(k.data || []);
      setBodegas(b.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  const agregarComponente = () => {
    if (!compProd) return aviso("Selecciona un componente", "error");
    if (!compCant || Number(compCant) <= 0)
      return aviso("Cantidad de componente inválida", "error");
    if (kitProd && compProd.id === kitProd.id)
      return aviso("Un kit no puede contenerse a sí mismo", "error");
    if (componentes.some((c) => c.producto.id === compProd.id))
      return aviso("Ese componente ya está en la lista", "error");
    setComponentes((prev) => [
      ...prev,
      { producto: compProd, cantidad: Number(compCant) },
    ]);
    setCompProd(null);
    setCompCant("");
  };

  const guardarKit = async () => {
    if (!kitProd) return aviso("Selecciona el producto del kit", "error");
    if (componentes.length === 0)
      return aviso("Agrega al menos un componente", "error");
    setCargando(true);
    try {
      await api.post("/api/kits", {
        kit_producto_id: kitProd.id,
        componentes: componentes.map((c) => ({
          producto_id: c.producto.id,
          cantidad: c.cantidad,
        })),
      });
      aviso("✓ Kit definido");
      setKitProd(null);
      setComponentes([]);
      await cargar();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al definir el kit", "error");
    } finally {
      setCargando(false);
    }
  };

  const setAccionCampo = (kitId, campo, valor) =>
    setAccion((prev) => ({
      ...prev,
      [kitId]: { ...prev[kitId], [campo]: valor },
    }));

  const operar = async (kitId, op) => {
    const a = accion[kitId] || {};
    if (!a.bodega) return aviso("Selecciona una bodega", "error");
    if (!a.cantidad || Number(a.cantidad) <= 0)
      return aviso("Cantidad inválida", "error");
    setCargando(true);
    try {
      const { data } = await api.post(`/api/kits/${kitId}/${op}`, {
        bodega_id: a.bodega,
        cantidad: Number(a.cantidad),
      });
      aviso(`✓ ${data.mensaje}`);
      setAccion((prev) => ({ ...prev, [kitId]: { bodega: a.bodega, cantidad: "" } }));
    } catch (err) {
      aviso(err.response?.data?.error || "Error en la operación", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout titulo="Kits" subtitulo="Ensamble y desensamble">
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

      {/* Definir kit */}
      <div style={{ ...C.card, maxWidth: "640px", marginBottom: "2rem" }}>
        <h3
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: "20px",
            letterSpacing: "0.04em",
            margin: "0 0 1rem",
          }}
        >
          Definir kit
        </h3>

        <div style={{ marginBottom: "12px" }}>
          <BuscadorProducto onSelect={setKitProd} label="Producto del kit *" />
          {kitProd && (
            <div
              style={{ ...C.mono, fontSize: "12px", color: "#007A40", marginTop: "6px" }}
            >
              Kit: {kitProd.codigo_interno}
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px dashed #E0E0E0",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "12px",
          }}
        >
          <label style={C.label}>Agregar componente</label>
          <BuscadorProducto onSelect={setCompProd} label="" />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <input
              type="number"
              min="1"
              style={{ ...C.input, flex: 1 }}
              value={compCant}
              onChange={(e) => setCompCant(e.target.value)}
              placeholder="Cantidad por kit"
            />
            <button
              onClick={agregarComponente}
              style={{
                background: "#0A0A0A",
                color: "#FFF",
                border: "none",
                borderRadius: "8px",
                padding: "0 16px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Outfit, sans-serif",
              }}
            >
              Agregar
            </button>
          </div>
        </div>

        {componentes.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            {componentes.map((c, i) => (
              <div
                key={c.producto.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid #F5F5F5",
                  fontSize: "13px",
                }}
              >
                <span>
                  <span style={{ ...C.mono, fontWeight: 700 }}>
                    {c.producto.codigo_interno}
                  </span>{" "}
                  × {c.cantidad}
                </span>
                <button
                  onClick={() =>
                    setComponentes((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#991B1B",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={guardarKit}
          disabled={cargando}
          style={{
            width: "100%",
            background: "#00FF87",
            color: "#0A0A0A",
            border: "none",
            borderRadius: "10px",
            padding: "13px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: cargando ? "not-allowed" : "pointer",
            fontFamily: "Outfit, sans-serif",
            opacity: cargando ? 0.6 : 1,
          }}
        >
          Guardar kit
        </button>
      </div>

      {/* Kits definidos */}
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
        Kits definidos
      </h3>
      {kits.length === 0 ? (
        <div style={{ ...C.card, textAlign: "center", color: "#888" }}>
          Aún no hay kits definidos
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {kits.map((k) => {
            const a = accion[k.kit_producto_id] || {};
            return (
              <div key={k.kit_producto_id} style={{ ...C.card }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>
                  {k.kit?.descripcion_corta || "—"}{" "}
                  <span style={{ ...C.mono, fontWeight: 400, color: "#888" }}>
                    ({k.kit?.codigo_interno})
                  </span>
                </div>
                <div
                  style={{ fontSize: "12px", color: "#666", margin: "6px 0 10px" }}
                >
                  {k.componentes
                    .map(
                      (c) =>
                        `${c.producto?.codigo_interno || c.componente_producto_id} ×${c.cantidad}`,
                    )
                    .join("  ·  ")}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    style={{ ...C.input, width: "auto", minWidth: "120px" }}
                    value={a.bodega || ""}
                    onChange={(e) =>
                      setAccionCampo(k.kit_producto_id, "bodega", e.target.value)
                    }
                  >
                    <option value="">Bodega…</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.codigo}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    style={{ ...C.input, width: "100px" }}
                    value={a.cantidad || ""}
                    onChange={(e) =>
                      setAccionCampo(k.kit_producto_id, "cantidad", e.target.value)
                    }
                    placeholder="Cant."
                  />
                  <button
                    onClick={() => operar(k.kit_producto_id, "ensamblar")}
                    disabled={cargando}
                    style={{
                      background: "#00FF87",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: "8px",
                      padding: "9px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Outfit, sans-serif",
                    }}
                  >
                    Ensamblar
                  </button>
                  {esGerente && (
                    <button
                      onClick={() => operar(k.kit_producto_id, "desensamblar")}
                      disabled={cargando}
                      style={{
                        background: "transparent",
                        color: "#991B1B",
                        border: "1.5px solid #FECACA",
                        borderRadius: "8px",
                        padding: "9px 14px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Outfit, sans-serif",
                      }}
                    >
                      Desensamblar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
