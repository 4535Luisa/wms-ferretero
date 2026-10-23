import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Pagina,
  Acciones,
  Boton,
  Tarjeta,
  FilaKpis,
  Kpi,
  Filtros,
  Campo,
  Mensaje,
  Tabla,
  Pastilla,
} from "../components/oficina";
import { estiloCampo, COLOR } from "../components/oficinaDatos";

const ROLES = [
  { value: "operario", label: "Operario" },
  { value: "montacarguista", label: "Montacarguista" },
  { value: "saldos", label: "Saldos" },
  { value: "gerente_logistico", label: "Gerente Logístico" },
  { value: "inventarios", label: "Inventarios" },
  { value: "facturacion", label: "Facturación" },
];

const colorRol = {
  administrador: { bg: "#0A0A0A", color: "#00FF87" },
  operario: { bg: "#E3F7EC", color: "#007A40" },
  montacarguista: { bg: "#DBEAFE", color: "#1E40AF" },
  saldos: { bg: "#FFF4D6", color: "#8A5A00" },
  gerente_logistico: { bg: "#FDECEC", color: "#B91C1C" },
  inventarios: { bg: "#EEF0F2", color: "#3A3F4B" },
  facturacion: { bg: "#E0F2FE", color: "#0369A1" },
};

const nombreRol = (rol) =>
  rol === "administrador"
    ? "Administrador"
    : ROLES.find((r) => r.value === rol)?.label || rol;

function Inicial({ nombre, activo }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        background: activo ? COLOR.verde : "#E2E4E8",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Bebas Neue, sans-serif",
        fontSize: "16px",
        color: COLOR.negro,
        flexShrink: 0,
      }}
    >
      {nombre?.charAt(0) || "U"}
    </span>
  );
}

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
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

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

  const texto = busqueda.toLowerCase();
  const usuariosFiltrados = usuarios.filter(
    (u) =>
      (!texto ||
        u.nombre.toLowerCase().includes(texto) ||
        u.email.toLowerCase().includes(texto) ||
        nombreRol(u.rol).toLowerCase().includes(texto)) &&
      (!filtroRol || u.rol === filtroRol) &&
      (!filtroEstado || (filtroEstado === "activo") === !!u.activo),
  );

  const activos = usuarios.filter((u) => u.activo).length;
  const rolesEnUso = [...new Set(usuarios.map((u) => u.rol))];

  const columnas = [
    {
      titulo: "Nombre",
      celda: (u) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
          <Inicial nombre={u.nombre} activo={u.activo} />
          <span style={{ fontWeight: 600 }}>{u.nombre}</span>
        </span>
      ),
    },
    {
      titulo: "Email",
      celda: (u) => (
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: "13px", color: COLOR.gris, wordBreak: "break-all" }}>
          {u.email}
        </span>
      ),
    },
    {
      titulo: "Rol",
      celda: (u) => {
        const c = colorRol[u.rol] || colorRol.inventarios;
        return <Pastilla texto={nombreRol(u.rol)} bg={c.bg} fg={c.color} />;
      },
    },
    {
      titulo: "Bodega",
      celda: (u) => <span style={{ color: COLOR.gris }}>{u.bodegas?.nombre || "—"}</span>,
    },
    {
      titulo: "Estado",
      celda: (u) =>
        u.activo ? (
          <Pastilla texto="Activo" bg="#E3F7EC" fg={COLOR.verdeTexto} />
        ) : (
          <Pastilla texto="Inactivo" bg="#FDECEC" fg={COLOR.rojo} />
        ),
    },
    {
      titulo: "",
      celda: (u) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
          <Boton pequeno onClick={() => abrirEditar(u)}>
            Editar
          </Boton>
          <Boton pequeno variante={u.activo ? "peligro" : "secundario"} onClick={() => toggleActivo(u)}>
            {u.activo ? "Desactivar" : "Activar"}
          </Boton>
        </span>
      ),
    },
  ];

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
      <Pagina>
        <Acciones>
          {vista === "lista" ? (
            <Boton variante="principal" onClick={abrirNuevo}>
              + Nuevo usuario
            </Boton>
          ) : (
            <Boton onClick={() => setVista("lista")}>← Volver</Boton>
          )}
        </Acciones>

        <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>

        {vista === "lista" && (
          <>
            <FilaKpis etiqueta="Resumen de usuarios">
              <Kpi etiqueta="Usuarios" valor={usuarios.length} />
              <Kpi etiqueta="Activos" valor={activos} colorValor={COLOR.verdeTexto} />
              <Kpi
                etiqueta="Inactivos"
                valor={usuarios.length - activos}
                colorValor={usuarios.length - activos > 0 ? COLOR.rojo : undefined}
              />
              <Kpi etiqueta="Roles en uso" valor={rolesEnUso.length} />
            </FilaKpis>

            <Filtros>
              <Campo etiqueta="Buscar" ancho="260px">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre, email o rol"
                  style={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Rol" ancho="180px">
                <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} style={estiloCampo}>
                  <option value="">Todos</option>
                  {rolesEnUso.map((r) => (
                    <option key={r} value={r}>
                      {nombreRol(r)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Estado" ancho="160px">
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={estiloCampo}>
                  <option value="">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
              </Campo>
            </Filtros>

            <Tarjeta
              titulo="Usuarios"
              subtitulo={
                usuariosFiltrados.length === usuarios.length
                  ? `${usuarios.length} en total`
                  : `${usuariosFiltrados.length} de ${usuarios.length}`
              }
            >
              <Tabla columnas={columnas} filas={usuariosFiltrados} vacio="No se encontraron usuarios" />
            </Tarjeta>
          </>
        )}

        {vista === "form" && (
          <Tarjeta
            titulo={usuarioEditando ? `Editar a ${usuarioEditando.nombre}` : "Nuevo usuario"}
            subtitulo="Los campos con * son obligatorios."
            style={{ maxWidth: "640px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              <Campo etiqueta="Nombre completo *" style={{ gridColumn: "1 / -1" }}>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Nombre del usuario"
                  style={estiloCampo}
                />
              </Campo>

              {!usuarioEditando && (
                <Campo etiqueta="Email *">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@indurruedas.com"
                    style={estiloCampo}
                  />
                </Campo>
              )}

              {!usuarioEditando && (
                <Campo etiqueta="Contraseña *">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                    style={estiloCampo}
                  />
                </Campo>
              )}

              <Campo etiqueta="Rol *">
                <select
                  value={form.rol}
                  onChange={(e) => setForm((p) => ({ ...p, rol: e.target.value }))}
                  style={estiloCampo}
                >
                  <option value="">Selecciona un rol</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo etiqueta="Bodega asignada">
                <select
                  value={form.bodega_id}
                  onChange={(e) => setForm((p) => ({ ...p, bodega_id: e.target.value }))}
                  style={estiloCampo}
                >
                  <option value="">Sin bodega específica</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} ({b.codigo})
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "24px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Boton onClick={() => setVista("lista")}>Cancelar</Boton>
              <Boton variante="principal" onClick={guardar} disabled={cargando}>
                {cargando ? "Guardando..." : usuarioEditando ? "Guardar cambios" : "Crear usuario"}
              </Boton>
            </div>
          </Tarjeta>
        )}
      </Pagina>
    </Layout>
  );
}
