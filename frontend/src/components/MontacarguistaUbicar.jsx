import { useState, useEffect } from "react";
import ScanInput, { bip } from "./ScanInput";
import api from "../services/api";

// Pestaña "Ubicar mercancía recibida"
// Flujo: escanea ubicación → escanea cajas → sistema asigna ubicación al inventario
export default function MontacarguistaUbicar() {
  const [pendientes, setPendientes] = useState([]);
  const [ubicacionActiva, setUbicacionActiva] = useState(null); // { codigo, id }
  const [ultimaCaja, setUltimaCaja] = useState(null);
  const [bodegas, setBodegas] = useState([]);
  const [bodegaId, setBodegaId] = useState("");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const cargarPendientes = async () => {
    try {
      const { data } = await api.get("/api/ubicaciones/pendientes-ubicar");
      setPendientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargarPendientes();
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

  const [nuevaUbicacion, setNuevaUbicacion] = useState(null); // { codigo, codigo_barras } para confirmar creacion

  const onEscanear = async (escaneado) => {
    if (cargando) return;
    setCargando(true);
    try {
      const { data: resolucion } = await api.get(
        `/api/ubicaciones/resolver?escaneado=${encodeURIComponent(escaneado)}`,
      );

      if (resolucion.tipo === "ubicacion") {
        bip("ok");
        setUbicacionActiva(resolucion.datos);
        setNuevaUbicacion(null);
        aviso(
          `📍 Ubicación ${resolucion.datos.codigo} activa — ahora escanea las cajas`,
        );
        return;
      }

      if (resolucion.tipo === "producto") {
        if (!ubicacionActiva) {
          bip("error");
          aviso(
            "⚠ Primero escanea la etiqueta de la ubicación destino",
            "error",
          );
          return;
        }
        const { data } = await api.post("/api/ubicaciones/ubicar-caja", {
          ubicacion_escaneada: `UB-${ubicacionActiva.codigo}`,
          caja_escaneada: escaneado,
        });
        bip("ok");
        setUltimaCaja({
          ...resolucion.datos,
          ubicacion: ubicacionActiva.codigo,
        });
        aviso(data.mensaje);
        await cargarPendientes();
        return;
      }
    } catch (err) {
      // Si la ubicación no existe, ofrecer crearla
      if (
        err.response?.status === 404 &&
        String(escaneado).toUpperCase().startsWith("UB-")
      ) {
        const codigo = String(escaneado)
          .trim()
          .replace(/^UB-/i, "")
          .toLowerCase();
        bip("ok");
        setNuevaUbicacion({ codigo, codigo_barras: `UB-${codigo}` });
        return;
      }
      bip("error");
      aviso(err.response?.data?.error || "Código no reconocido", "error");
    } finally {
      setCargando(false);
    }
  };

  const crearYActivarUbicacion = async () => {
    if (!nuevaUbicacion || !bodegaId) return;
    setCargando(true);
    try {
      const { data } = await api.post("/api/ubicaciones/crear", {
        codigo: nuevaUbicacion.codigo,
        codigo_barras: nuevaUbicacion.codigo_barras,
        bodega_id: bodegaId,
        tipo: "picking",
      });
      bip("ok");
      setUbicacionActiva(data.data);
      setNuevaUbicacion(null);
      aviso(
        `✓ Ubicación ${nuevaUbicacion.codigo.toUpperCase()} creada y activa — ahora escanea las cajas`,
      );
    } catch (err) {
      bip("error");
      aviso(
        err.response?.data?.error || "Error al crear la ubicación",
        "error",
      );
    } finally {
      setCargando(false);
    }
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

      {/* Ubicación activa */}
      {ubicacionActiva ? (
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
              {ubicacionActiva.codigo}
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
            Cambiar
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "#FEF9C3",
            border: "1px solid #FDE68A",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "1rem",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#854D0E" }}>
            ⚠ Escanea primero la etiqueta de la ubicación destino
          </div>
          <div style={{ fontSize: "12px", color: "#92400E", marginTop: "4px" }}>
            Ejemplo: escanea la etiqueta UB-f1-3 de la estantería
          </div>
        </div>
      )}

      {nuevaUbicacion && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1.5px solid #FDE68A",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#854D0E",
              marginBottom: "8px",
            }}
          >
            📍 Ubicación nueva detectada — ¿Crearla?
          </div>
          <div
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: "22px",
              fontWeight: 700,
              color: "#0A0A0A",
              marginBottom: "8px",
            }}
          >
            {nuevaUbicacion.codigo.toUpperCase()}
          </div>
          <select
            value={bodegaId}
            onChange={(e) => setBodegaId(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: "1px solid #E8E8E8",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "12px",
            }}
          >
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre} ({b.codigo})
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setNuevaUbicacion(null)}
              style={{
                flex: 1,
                padding: "10px",
                border: "1.5px solid #E8E8E8",
                borderRadius: "8px",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={crearYActivarUbicacion}
              disabled={cargando}
              style={{
                flex: 2,
                padding: "10px",
                border: "none",
                borderRadius: "8px",
                background: "#00FF87",
                color: "#0A0A0A",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✓ Crear y activar
            </button>
          </div>
        </div>
      )}

      <ScanInput
        onScan={onEscanear}
        disabled={cargando || !!nuevaUbicacion}
        label={
          ubicacionActiva
            ? "Escanea cada caja a ubicar"
            : "Escanea la etiqueta de la ubicación"
        }
        hint="Primero la ubicación, luego las cajas — si la ubicación es nueva el sistema la crea automáticamente"
      />

      {/* Última caja ubicada */}
      {ultimaCaja && (
        <div
          style={{
            background: "rgba(0,255,135,0.06)",
            border: "1px solid rgba(0,255,135,0.2)",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "1rem",
          }}
        >
          <div style={{ fontSize: "11px", color: "#888" }}>
            Última caja ubicada
          </div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#007A40" }}>
            {ultimaCaja.descripcion_corta}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#888",
              fontFamily: "DM Mono, monospace",
            }}
          >
            Ref: {ultimaCaja.codigo_interno} → {ultimaCaja.ubicacion}
          </div>
        </div>
      )}

      {/* Pendientes de ubicar */}
      <div style={{ marginTop: "1rem" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "8px",
          }}
        >
          📦 Pendientes de ubicar ({pendientes.length})
        </div>
        {pendientes.length === 0 ? (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "2rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "14px", color: "#888" }}>
              ✓ Toda la mercancía está ubicada
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendientes.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E8",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {item.productos?.descripcion_corta}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#888",
                      fontFamily: "DM Mono, monospace",
                      marginTop: "2px",
                    }}
                  >
                    Ref: {item.productos?.codigo_interno} ·{" "}
                    {item.bodegas?.codigo}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "DM Mono, monospace",
                      fontWeight: 700,
                      fontSize: "16px",
                      color: "#0A0A0A",
                    }}
                  >
                    {item.cantidad_disponible}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888" }}>
                    unidades
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
