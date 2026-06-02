import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";

const ROLES = [
  { value: "operario", label: "Operario" },
  { value: "montacarguista", label: "Montacarguista" },
  { value: "saldos", label: "Saldos" },
  { value: "jefe_bodega", label: "Jefe de Bodega" },
  { value: "gerente_logistico", label: "Gerente Logístico" },
  { value: "inventarios", label: "Inventarios" },
  { value: "facturacion", label: "Facturación" },
];

const colorRol = {
  operario: { bg: "rgba(0,255,135,0.1)", color: "#007A40" },
  montacarguista: { bg: "#dbeafe", color: "#1e40af" },
  saldos: { bg: "#fef9c3", color: "#854d0e" },
  jefe_bodega: { bg: "#ede9fe", color: "#5b21b6" },
  gerente_logistico: { bg: "#fee2e2", color: "#991b1b" },
  inventarios: { bg: "#f3f4f6", color: "#374151" },
  facturacion: { bg: "#E0F2FE", color: "#0369A1" },
};

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [vista, setVista] = useState("lista");
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [form, setForm] = useState({
    email: "",
    nombre: "",
    rol: "",
    bodega_id: "",
    password: "",
  });
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const cargarDatos = async () => {
    try {
      const [{ data: u }, { data: b }] = await Promise.all([
        api.get("/api/usuarios"),
        api.get("/api/usuarios/bodegas"),
      ]);
      setUsuarios(u);
      setBodegas(b);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, []);

  const mostrarMensaje = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const abrirNuevo = () => {
    setForm({ email: "", nombre: "", rol: "", bodega_id: "", password: "" });
    setUsuarioEditando(null);
    setVista("form");
  };

  const abrirEditar = (u) => {
    setForm({
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      bodega_id: u.bodega_id || "",
      password: "",
    });
    setUsuarioEditando(u);
    setVista("form");
  };

  const guardar = async () => {
    if (!form.nombre || !form.rol)
      return mostrarMensaje("Nombre y rol son obligatorios", "error");
    if (!usuarioEditando && (!form.email || !form.password))
      return mostrarMensaje("Email y contraseña son obligatorios", "error");
    setCargando(true);
    try {
      if (usuarioEditando) {
        await api.put(`/api/usuarios/${usuarioEditando.id}`, {
          nombre: form.nombre,
          rol: form.rol,
          bodega_id: form.bodega_id || null,
        });
        mostrarMensaje("Usuario actualizado correctamente");
      } else {
        await api.post("/api/usuarios", {
          email: form.email,
          nombre: form.nombre,
          rol: form.rol,
          bodega_id: form.bodega_id || null,
          password: form.password,
        });
        mostrarMensaje("Usuario creado correctamente");
      }
      cargarDatos();
      setVista("lista");
    } catch (err) {
      mostrarMensaje(err.response?.data?.error || "Error al guardar", "error");
    } finally {
      setCargando(false);
    }
  };

  const toggleActivo = async (u) => {
    try {
      await api.patch(`/api/usuarios/${u.id}/toggle`);
      mostrarMensaje(`Usuario ${u.activo ? "desactivado" : "activado"}`);
      cargarDatos();
    } catch {
      mostrarMensaje("Error al cambiar estado", "error");
    }
  };

  const usuariosFiltrados = usuarios.filter(
    (u) =>
      u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.rol.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "Outfit, sans-serif",
    fontSize: "14px",
    border: "1.5px solid #E8E8E8",
    borderRadius: "8px",
    padding: "10px 14px",
    outline: "none",
    background: "#FFFFFF",
    color: "#0A0A0A",
  };
  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#888",
    display: "block",
    marginBottom: "7px",
  };

  return (
    <Layout
      titulo="Usuarios"
      subtitulo={
        vista === "lista"
          ? `${usuarios.length} usuarios registrados`
          : usuarioEditando
            ? "Editar usuario"
            : "Nuevo usuario"
      }
    >
      {/* Acciones */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
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
            }}
          >
            ← Volver
          </button>
        )}
        {vista === "lista" && (
          <button
            onClick={abrirNuevo}
            style={{
              background: "#00FF87",
              color: "#0A0A0A",
              border: "none",
              borderRadius: "8px",
              padding: "9px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {/* Mensaje */}
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

      {/* LISTA */}
      {vista === "lista" && (
        <div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, email o rol..."
            style={{ ...inputStyle, marginBottom: "1rem" }}
          />

          {/* Escritorio — tabla */}
          <div style={{ display: "none" }} className="tabla-desktop">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "#FFFFFF",
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid #E8E8E8",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#F8F8F8",
                    borderBottom: "1px solid #E8E8E8",
                  }}
                >
                  {[
                    "Nombre",
                    "Email",
                    "Rol",
                    "Bodega",
                    "Estado",
                    "Acciones",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#888",
                        fontFamily: "Outfit, sans-serif",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u, idx) => {
                  const badge = colorRol[u.rol] || {
                    bg: "#f3f4f6",
                    color: "#374151",
                  };
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom:
                          idx < usuariosFiltrados.length - 1
                            ? "1px solid #F5F5F5"
                            : "none",
                      }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                              background: "#00FF87",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontFamily: "Bebas Neue, sans-serif",
                              fontSize: "16px",
                              color: "#0A0A0A",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {u.nombre?.charAt(0) || "U"}
                          </div>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "#0A0A0A",
                            }}
                          >
                            {u.nombre}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: "13px",
                          color: "#555",
                          fontFamily: "DM Mono, monospace",
                        }}
                      >
                        {u.email}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.color,
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          {ROLES.find((r) => r.value === u.rol)?.label || u.rol}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: "13px",
                          color: "#888",
                        }}
                      >
                        {u.bodegas?.nombre || "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            background: u.activo
                              ? "rgba(0,255,135,0.1)"
                              : "#FEE2E2",
                            color: u.activo ? "#007A40" : "#991B1B",
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {u.activo ? "ACTIVO" : "INACTIVO"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => abrirEditar(u)}
                            style={{
                              background: "#F0F0F0",
                              color: "#0A0A0A",
                              border: "none",
                              borderRadius: "6px",
                              padding: "6px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                            }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleActivo(u)}
                            style={{
                              background: u.activo
                                ? "#FEE2E2"
                                : "rgba(0,255,135,0.1)",
                              color: u.activo ? "#991B1B" : "#007A40",
                              border: "none",
                              borderRadius: "6px",
                              padding: "6px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "Outfit, sans-serif",
                            }}
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil — cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {usuariosFiltrados.map((u) => {
              const badge = colorRol[u.rol] || {
                bg: "#f3f4f6",
                color: "#374151",
              };
              return (
                <div
                  key={u.id}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E8",
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: u.activo ? "#00FF87" : "#E0E0E0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "Bebas Neue, sans-serif",
                          fontSize: "18px",
                          color: "#0A0A0A",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {u.nombre?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#0A0A0A",
                          }}
                        >
                          {u.nombre}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#888",
                            fontFamily: "DM Mono, monospace",
                            marginTop: "2px",
                          }}
                        >
                          {u.email}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        background: u.activo
                          ? "rgba(0,255,135,0.1)"
                          : "#FEE2E2",
                        color: u.activo ? "#007A40" : "#991B1B",
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        flexShrink: 0,
                      }}
                    >
                      {u.activo ? "ACTIVO" : "INACTIVO"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {ROLES.find((r) => r.value === u.rol)?.label || u.rol}
                      </span>
                      {u.bodegas && (
                        <span style={{ fontSize: "12px", color: "#888" }}>
                          {u.bodegas.nombre}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => abrirEditar(u)}
                        style={{
                          background: "#F0F0F0",
                          color: "#0A0A0A",
                          border: "none",
                          borderRadius: "6px",
                          padding: "7px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Outfit, sans-serif",
                          minHeight: "44px",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActivo(u)}
                        style={{
                          background: u.activo
                            ? "#FEE2E2"
                            : "rgba(0,255,135,0.1)",
                          color: u.activo ? "#991B1B" : "#007A40",
                          border: "none",
                          borderRadius: "6px",
                          padding: "7px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Outfit, sans-serif",
                          minHeight: "44px",
                        }}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {usuariosFiltrados.length === 0 && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E8",
                  borderRadius: "12px",
                  padding: "3rem",
                  textAlign: "center",
                }}
              >
                <p style={{ color: "#BBB", fontSize: "14px" }}>
                  No se encontraron usuarios
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FORMULARIO */}
      {vista === "form" && (
        <div style={{ maxWidth: "520px" }}>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E8E8",
              borderRadius: "12px",
              padding: "1.75rem",
            }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Nombre completo *</label>
              <input
                value={form.nombre}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nombre: e.target.value }))
                }
                placeholder="Nombre del usuario"
                style={inputStyle}
              />
            </div>

            {!usuarioEditando && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="usuario@indurruedas.com"
                  style={inputStyle}
                />
              </div>
            )}

            {!usuarioEditando && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={labelStyle}>Contraseña *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, password: e.target.value }))
                  }
                  placeholder="Mínimo 8 caracteres"
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Rol *</label>
              <select
                value={form.rol}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rol: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">Selecciona un rol</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "2rem" }}>
              <label style={labelStyle}>Bodega asignada</label>
              <select
                value={form.bodega_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, bodega_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">Sin bodega específica</option>
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} ({b.codigo})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setVista("lista")}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "#0A0A0A",
                  border: "1.5px solid #E8E8E8",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                  minHeight: "44px",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={cargando}
                style={{
                  flex: 2,
                  background: "#00FF87",
                  color: "#0A0A0A",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: cargando ? "not-allowed" : "pointer",
                  fontFamily: "Outfit, sans-serif",
                  minHeight: "44px",
                  opacity: cargando ? 0.6 : 1,
                }}
              >
                {cargando
                  ? "Guardando..."
                  : usuarioEditando
                    ? "Guardar cambios"
                    : "Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
