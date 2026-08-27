import { useState } from "react";
import ScanInput, { bip } from "./ScanInput";
import api from "../services/api";

// Pestaña "Mover cajas"
// Dos modos:
//   - Cajas sueltas: origen → caja(s) → destino
//   - Ubicación completa: origen → destino (mueve todo)
export default function MontacarguistaMover() {
  const [modo, setModo] = useState(null); // "cajas" | "ubicacion"
  const [paso, setPaso] = useState("origen"); // "origen" | "cajas" | "destino"
  const [origen, setOrigen] = useState(null);
  const [destino, setDestino] = useState(null);
  const [cajasMovidas, setCajasMovidas] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [resumen, setResumen] = useState(null);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const resetear = () => {
    setModo(null);
    setPaso("origen");
    setOrigen(null);
    setDestino(null);
    setCajasMovidas([]);
    setResumen(null);
  };

  const onEscanear = async (escaneado) => {
    if (cargando) return;
    setCargando(true);
    try {
      const { data: resolucion } = await api.get(
        `/api/ubicaciones/resolver?escaneado=${escaneado}`,
      );

      // ── MODO CAJAS SUELTAS ──────────────────────────────────────────────
      if (modo === "cajas") {
        if (paso === "origen") {
          if (resolucion.tipo !== "ubicacion") {
            bip("error");
            aviso("⚠ Escanea la etiqueta de la ubicación origen", "error");
            return;
          }
          bip("ok");
          setOrigen(resolucion.datos);
          setPaso("cajas");
          aviso(
            `📍 Origen: ${resolucion.datos.codigo} — ahora escanea las cajas a mover`,
          );
          return;
        }
        if (paso === "cajas") {
          if (resolucion.tipo === "ubicacion") {
            // Es el destino
            if (cajasMovidas.length === 0) {
              bip("error");
              aviso(
                "⚠ Escanea al menos una caja antes de indicar el destino",
                "error",
              );
              return;
            }
            setDestino(resolucion.datos);
            setPaso("destino");
            aviso(
              `📍 Destino: ${resolucion.datos.codigo} — confirmando traslado...`,
            );
            // Ejecutar todos los movimientos
            let errores = 0;
            for (const caja of cajasMovidas) {
              try {
                await api.post("/api/ubicaciones/mover-caja", {
                  ubicacion_origen_escaneada: `UB-${origen.codigo}`,
                  caja_escaneada: caja.codigo_barras || caja.codigo_interno,
                  ubicacion_destino_escaneada: `UB-${resolucion.datos.codigo}`,
                });
              } catch {
                errores++;
              }
            }
            bip(errores === 0 ? "ok" : "error");
            setResumen({
              cajasMovidas: cajasMovidas.length - errores,
              errores,
              origen: origen.codigo,
              destino: resolucion.datos.codigo,
            });
            aviso(
              errores === 0
                ? `✓ ${cajasMovidas.length} caja(s) movidas de ${origen.codigo} a ${resolucion.datos.codigo}`
                : `⚠ ${errores} errores al mover`,
              errores > 0 ? "error" : "ok",
            );
            return;
          }
          if (resolucion.tipo === "producto") {
            // Acumular cajas a mover
            bip("ok");
            setCajasMovidas((prev) => [...prev, resolucion.datos]);
            aviso(
              `✓ ${resolucion.datos.codigo_interno} agregada — escanea más cajas o escanea la ubicación destino`,
            );
            return;
          }
        }
      }

      // ── MODO UBICACIÓN COMPLETA ─────────────────────────────────────────
      if (modo === "ubicacion") {
        if (paso === "origen") {
          if (resolucion.tipo !== "ubicacion") {
            bip("error");
            aviso("⚠ Escanea la etiqueta de la ubicación origen", "error");
            return;
          }
          bip("ok");
          setOrigen(resolucion.datos);
          setPaso("destino");
          aviso(
            `📍 Origen: ${resolucion.datos.codigo} — ahora escanea la ubicación destino`,
          );
          return;
        }
        if (paso === "destino") {
          if (resolucion.tipo !== "ubicacion") {
            bip("error");
            aviso("⚠ Escanea la etiqueta de la ubicación destino", "error");
            return;
          }
          setDestino(resolucion.datos);
          aviso(`📍 Destino: ${resolucion.datos.codigo} — moviendo todo...`);
          const { data } = await api.post("/api/ubicaciones/mover-ubicacion", {
            ubicacion_origen_escaneada: `UB-${origen.codigo}`,
            ubicacion_destino_escaneada: `UB-${resolucion.datos.codigo}`,
          });
          bip("ok");
          setResumen({
            itemsMovidos: data.items_movidos,
            origen: origen.codigo,
            destino: resolucion.datos.codigo,
          });
          aviso(data.mensaje);
          return;
        }
      }
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al procesar", "error");
    } finally {
      setCargando(false);
    }
  };

  // Instrucción según el paso actual
  const instruccion = () => {
    if (!modo) return "";
    if (modo === "cajas") {
      if (paso === "origen")
        return "Escanea la etiqueta de la ubicación origen";
      if (paso === "cajas")
        return cajasMovidas.length === 0
          ? "Escanea las cajas a mover"
          : `${cajasMovidas.length} caja(s) — escanea más o escanea la ubicación destino`;
    }
    if (modo === "ubicacion") {
      if (paso === "origen")
        return "Escanea la etiqueta de la ubicación origen";
      if (paso === "destino")
        return "Escanea la etiqueta de la ubicación destino";
    }
    return "";
  };

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

      {/* Resumen de traslado completado */}
      {resumen && (
        <div
          style={{
            background: "rgba(0,255,135,0.08)",
            border: "1.5px solid #00FF87",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "20px",
              color: "#007A40",
              marginBottom: "8px",
            }}
          >
            ✓ Traslado completado
          </div>
          <div style={{ fontSize: "13px", color: "#374151" }}>
            De <strong>{resumen.origen}</strong> →{" "}
            <strong>{resumen.destino}</strong>
          </div>
          {resumen.cajasMovidas !== undefined && (
            <div style={{ fontSize: "13px", color: "#374151" }}>
              {resumen.cajasMovidas} caja(s) movidas
              {resumen.errores > 0 ? ` · ${resumen.errores} con error` : ""}
            </div>
          )}
          {resumen.itemsMovidos !== undefined && (
            <div style={{ fontSize: "13px", color: "#374151" }}>
              {resumen.itemsMovidos} referencias movidas
            </div>
          )}
          <button
            onClick={resetear}
            style={{
              marginTop: "12px",
              background: "#0A0A0A",
              color: "#00FF87",
              border: "none",
              borderRadius: "8px",
              padding: "9px 16px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Nuevo traslado
          </button>
        </div>
      )}

      {/* Selección de modo */}
      {!modo && !resumen && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "13px", color: "#888" }}>¿Qué quieres mover?</p>
          {[
            {
              id: "cajas",
              icon: "📦",
              titulo: "Cajas sueltas",
              desc: "Mueve una o varias cajas específicas de una ubicación a otra",
            },
            {
              id: "ubicacion",
              icon: "🏗",
              titulo: "Toda una ubicación",
              desc: "Mueve todo el contenido de una estantería a otra",
            },
          ].map((op) => (
            <div
              key={op.id}
              onClick={() => setModo(op.id)}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E8",
                borderRadius: "12px",
                padding: "1.25rem",
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
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>
                {op.icon}
              </div>
              <div
                style={{
                  fontFamily: "Bebas Neue, sans-serif",
                  fontSize: "18px",
                  color: "#0A0A0A",
                }}
              >
                {op.titulo}
              </div>
              <div
                style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}
              >
                {op.desc}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flujo de escaneo */}
      {modo && !resumen && (
        <div>
          <button
            onClick={resetear}
            style={{
              background: "transparent",
              border: "1.5px solid #E8E8E8",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: "1rem",
            }}
          >
            ← Cancelar
          </button>

          {/* Indicadores de paso */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            {[
              { id: "origen", label: "1. Origen", valor: origen?.codigo },
              ...(modo === "cajas"
                ? [
                    {
                      id: "cajas",
                      label: "2. Cajas",
                      valor:
                        cajasMovidas.length > 0
                          ? `${cajasMovidas.length} caja(s)`
                          : null,
                    },
                  ]
                : []),
              {
                id: "destino",
                label: modo === "cajas" ? "3. Destino" : "2. Destino",
                valor: destino?.codigo,
              },
            ].map((p) => (
              <div
                key={p.id}
                style={{
                  background: p.valor ? "rgba(0,255,135,0.1)" : "#F0F0F0",
                  border: `1px solid ${p.valor ? "rgba(0,255,135,0.3)" : "#E8E8E8"}`,
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: p.valor ? "#007A40" : "#888",
                }}
              >
                {p.label}: {p.valor || "—"}
              </div>
            ))}
          </div>

          <ScanInput
            onScan={onEscanear}
            disabled={cargando}
            label={instruccion()}
            hint="Escanea la etiqueta UB-xxx para ubicaciones, código de barras para cajas"
          />

          {/* Cajas acumuladas */}
          {modo === "cajas" && cajasMovidas.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#888",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                Cajas a mover ({cajasMovidas.length})
              </div>
              {cajasMovidas.map((caja, i) => (
                <div
                  key={i}
                  style={{
                    background: "#F8F8F8",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    marginBottom: "6px",
                    fontSize: "13px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "DM Mono, monospace",
                      fontWeight: 700,
                    }}
                  >
                    {caja.codigo_interno}
                  </span>
                  <span style={{ color: "#888", marginLeft: "8px" }}>
                    {caja.descripcion_corta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
