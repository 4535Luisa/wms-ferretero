import { useState, useEffect } from "react";
import ScanInput, { bip } from "./ScanInput";
import api from "../services/api";

// Componente para que el montacarguista cree una nueva ubicación
// escaneando una etiqueta nueva (formato UB-xxx)
export default function MontacarguistaCrearUbicacion() {
  const [bodegas, setBodegas] = useState([]);
  const [bodegaId, setBodegaId] = useState("");
  const [paso, setPaso] = useState("scan"); // "scan" | "confirm" | "ok"
  const [codigoEscaneado, setCodigoEscaneado] = useState("");
  const [codigoUbicacion, setCodigoUbicacion] = useState("");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api
      .get("/api/usuarios/bodegas")
      .then(({ data }) => {
        const bs = (data || []).filter((b) => b.codigo !== "SALDOS");
        setBodegas(bs);
        if (bs.length > 0) setBodegaId(bs[0].id);
      })
      .catch(console.error);
  }, []);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const onEscanear = (escaneado) => {
    const raw = escaneado.trim().toUpperCase();
    // Verificar que es formato UB-xxx
    if (!raw.startsWith("UB-")) {
      bip("error");
      aviso("⚠ La etiqueta debe empezar con UB- (ej: UB-a1-1)", "error");
      return;
    }
    const codigo = raw.replace(/^UB-/, "").toLowerCase();
    setCodigoEscaneado(raw);
    setCodigoUbicacion(codigo);
    setPaso("confirm");
    bip("ok");
  };

  const confirmar = async () => {
    if (!bodegaId || !codigoUbicacion) return;
    setCargando(true);
    try {
      await api.post("/api/ubicaciones/crear", {
        codigo: codigoUbicacion,
        codigo_barras: `UB-${codigoUbicacion}`,
        bodega_id: bodegaId,
        tipo: "picking",
      });
      bip("ok");
      setPaso("ok");
    } catch (err) {
      bip("error");
      aviso(
        err.response?.data?.error || "Error al crear la ubicación",
        "error",
      );
      setPaso("scan");
    } finally {
      setCargando(false);
    }
  };

  const reiniciar = () => {
    setPaso("scan");
    setCodigoEscaneado("");
    setCodigoUbicacion("");
  };

  const bodegaActual = bodegas.find((b) => b.id === bodegaId);

  return (
    <div>
      {mensaje.texto && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1rem",
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

      {paso === "ok" ? (
        <div
          style={{
            background: "rgba(0,255,135,0.08)",
            border: "1.5px solid #00FF87",
            borderRadius: "12px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "1rem" }}>✓</div>
          <div
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "24px",
              color: "#007A40",
            }}
          >
            Ubicación creada
          </div>
          <div
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "20px",
              fontWeight: 700,
              color: "#0A0A0A",
              marginTop: "8px",
            }}
          >
            {codigoUbicacion.toUpperCase()}
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
            Bodega: {bodegaActual?.nombre}
          </div>
          <button
            onClick={reiniciar}
            style={{
              marginTop: "1.5rem",
              background: "#0A0A0A",
              color: "#00FF87",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Crear otra ubicación
          </button>
        </div>
      ) : paso === "confirm" ? (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E8E8E8",
            borderRadius: "12px",
            padding: "1.5rem",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "8px" }}>
            Nueva ubicación a crear:
          </div>
          <div
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "28px",
              fontWeight: 700,
              color: "#0A0A0A",
              marginBottom: "4px",
            }}
          >
            {codigoUbicacion.toUpperCase()}
          </div>
          <div
            style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}
          >
            Código de barras:{" "}
            <span style={{ fontFamily: "DM Mono, monospace" }}>
              {codigoEscaneado}
            </span>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#666",
                display: "block",
                marginBottom: "6px",
              }}
            >
              Bodega
            </label>
            <select
              value={bodegaId}
              onChange={(e) => setBodegaId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #E8E8E8",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} ({b.codigo})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={reiniciar}
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
              onClick={confirmar}
              disabled={cargando}
              style={{
                flex: 2,
                padding: "12px",
                border: "none",
                borderRadius: "8px",
                background: "#00FF87",
                color: "#0A0A0A",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {cargando ? "Creando..." : "✓ Confirmar"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              background: "#FEF9C3",
              border: "1px solid #FDE68A",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{ fontSize: "13px", fontWeight: 600, color: "#854D0E" }}
            >
              📋 Instrucciones
            </div>
            <div
              style={{ fontSize: "12px", color: "#92400E", marginTop: "4px" }}
            >
              1. Imprime y pega la etiqueta nueva en la estantería
              <br />
              2. Escanea la etiqueta — debe tener formato UB-a1-1
              <br />
              3. Confirma la bodega y crea la ubicación
            </div>
          </div>
          <ScanInput
            onScan={onEscanear}
            label="Escanea la nueva etiqueta de ubicación"
            hint="Formato: UB-a1-1, UB-b2-3, etc."
          />
        </div>
      )}
    </div>
  );
}
