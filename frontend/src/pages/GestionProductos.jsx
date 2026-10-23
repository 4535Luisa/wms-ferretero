import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ScanInput from "../components/ScanInput";
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
  Nota,
} from "../components/oficina";
import { estiloCampo, COLOR } from "../components/oficinaDatos";
import { num } from "../components/panel/formato";

const FILAS_POR_PAGINA = 100;
const mono = { fontFamily: "DM Mono, monospace" };

const ABC = {
  A: { bg: "#FDECEC", fg: "#B91C1C" },
  B: { bg: "#FFF4D6", fg: "#8A5A00" },
  C: { bg: "#F0F1F3", fg: "#3A3F4B" },
};
const insigniaAbc = (abc) => {
  const c = ABC[abc] || ABC.C;
  return <Pastilla texto={abc || "—"} bg={c.bg} fg={c.fg} />;
};

// Estado del código de barras de la caja master.
const estadoCodigo = (p) => (p.ean14 ? "ean14" : p.sin_codigo_barras ? "sin" : "pendiente");
const insigniaCodigo = (p) => {
  const e = estadoCodigo(p);
  if (e === "ean14") return <Pastilla texto="EAN14" bg="#E3F7EC" fg={COLOR.verdeTexto} />;
  if (e === "sin") return <Pastilla texto="Se baja manual" bg="#EEF0F2" fg="#3A3F4B" />;
  return <Pastilla texto="Pendiente" bg="#FFF4D6" fg={COLOR.ambar} />;
};

export default function GestionProductos() {
  const [productos, setProductos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [filtroAbc, setFiltroAbc] = useState("");
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [limite, setLimite] = useState(FILAS_POR_PAGINA);
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
      aviso("El EAN14 debe tener exactamente 14 dígitos", "error");
      return;
    }
    setCargando(true);
    try {
      await api.patch(`/api/productos/${seleccionado.id}/codigo-barras`, {
        ean14: editando.ean14 || null,
        sin_codigo_barras: editando.sin_codigo_barras,
      });
      aviso("Código de barras actualizado correctamente");
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
      aviso("El código interno es obligatorio", "error");
      return;
    }
    if (!nuevoProducto.descripcion_corta.trim()) {
      aviso("La descripción es obligatoria", "error");
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
    aviso(`Código capturado: ${cb}`);
  };

  const filtrado = productos.filter((p) => {
    const f = filtro.toLowerCase();
    return (
      (!f ||
        (p.codigo_interno || "").toLowerCase().includes(f) ||
        (p.descripcion_corta || "").toLowerCase().includes(f)) &&
      (!filtroAbc || (p.clasificacion_abc || "C") === filtroAbc) &&
      (!filtroCodigo || estadoCodigo(p) === filtroCodigo)
    );
  });

  const conEan = productos.filter((p) => p.ean14).length;
  const sinCodigo = productos.filter((p) => !p.ean14 && p.sin_codigo_barras).length;
  const pendientes = productos.length - conEan - sinCodigo;

  const conFiltro = (fn) => (e) => {
    fn(e.target.value);
    setLimite(FILAS_POR_PAGINA);
  };

  const columnas = [
    {
      titulo: "Referencia",
      celda: (p) => <span style={{ ...mono, fontWeight: 600, whiteSpace: "nowrap" }}>{p.codigo_interno}</span>,
    },
    {
      titulo: "Descripción",
      celda: (p) => (
        <span
          title={p.descripcion_corta}
          style={{
            display: "inline-block",
            maxWidth: "360px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "bottom",
          }}
        >
          {p.descripcion_corta}
        </span>
      ),
    },
    { titulo: "ABC", celda: (p) => insigniaAbc(p.clasificacion_abc) },
    { titulo: "Und. por caja", num: true, celda: (p) => num(p.unidad_empaque) },
    {
      titulo: "EAN14",
      celda: (p) => <span style={{ ...mono, fontSize: "13px", color: COLOR.gris }}>{p.ean14 || "—"}</span>,
    },
    { titulo: "Código de barras", celda: insigniaCodigo },
  ];

  const ean = editando.ean14;
  const eanInvalido = !editando.sin_codigo_barras && ean.length > 0 && ean.length !== 14;

  return (
    <Layout
      titulo="Productos"
      subtitulo={
        modo === "lista"
          ? `${filtrado.length} referencias`
          : seleccionado?.codigo_interno
      }
    >
      <Pagina>
        <Acciones>
          {modo === "lista" ? (
            <Boton variante={vistaCrear ? "secundario" : "principal"} onClick={() => setVistaCrear((v) => !v)}>
              {vistaCrear ? "Cancelar" : "+ Nuevo producto"}
            </Boton>
          ) : (
            <Boton onClick={() => setModo("lista")}>← Volver</Boton>
          )}
        </Acciones>

        <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>

        {modo === "lista" && (
          <>
            {vistaCrear && (
              <Tarjeta titulo="Crear producto nuevo" subtitulo="Los campos con * son obligatorios." style={{ maxWidth: "760px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  <Campo etiqueta="Código interno SIESA *">
                    <input
                      value={nuevoProducto.codigo_interno}
                      onChange={(e) => setNuevoProducto((p) => ({ ...p, codigo_interno: e.target.value }))}
                      placeholder="Ej: 120390"
                      style={{ ...estiloCampo, ...mono }}
                    />
                  </Campo>
                  <Campo etiqueta="Unidad de empaque (unidades por caja) *">
                    <input
                      type="number"
                      value={nuevoProducto.unidad_empaque}
                      onChange={(e) => setNuevoProducto((p) => ({ ...p, unidad_empaque: e.target.value }))}
                      placeholder="Ej: 24"
                      style={estiloCampo}
                    />
                  </Campo>
                  <Campo etiqueta="Descripción *" style={{ gridColumn: "1 / -1" }}>
                    <input
                      value={nuevoProducto.descripcion_corta}
                      onChange={(e) => setNuevoProducto((p) => ({ ...p, descripcion_corta: e.target.value }))}
                      placeholder="Ej: ROD F 4 PVNA NARANJA MACHO"
                      style={estiloCampo}
                    />
                  </Campo>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                  <Boton variante="principal" onClick={crearProducto} disabled={cargando}>
                    {cargando ? "Creando..." : "Crear producto"}
                  </Boton>
                </div>
              </Tarjeta>
            )}

            <FilaKpis etiqueta="Resumen de productos">
              <Kpi etiqueta="Referencias" valor={num(productos.length)} />
              <Kpi etiqueta="Con EAN14" valor={num(conEan)} colorValor={COLOR.verdeTexto} />
              <Kpi etiqueta="Se bajan manual" valor={num(sinCodigo)} pie="sin código de barras" />
              <Kpi
                etiqueta="Pendientes de código"
                valor={num(pendientes)}
                colorValor={pendientes > 0 ? COLOR.ambar : undefined}
                pie={pendientes > 0 ? "falta registrar su EAN14" : undefined}
                colorPie={COLOR.ambar}
              />
            </FilaKpis>

            <Filtros>
              <Campo etiqueta="Buscar" ancho="260px">
                <input
                  value={filtro}
                  onChange={conFiltro(setFiltro)}
                  placeholder="Referencia o descripción"
                  style={estiloCampo}
                />
              </Campo>
              <Campo etiqueta="Clasificación ABC" ancho="150px">
                <select value={filtroAbc} onChange={conFiltro(setFiltroAbc)} style={estiloCampo}>
                  <option value="">Todas</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </Campo>
              <Campo etiqueta="Código de barras" ancho="180px">
                <select value={filtroCodigo} onChange={conFiltro(setFiltroCodigo)} style={estiloCampo}>
                  <option value="">Todos</option>
                  <option value="ean14">Con EAN14</option>
                  <option value="sin">Se baja manual</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </Campo>
            </Filtros>

            <Tarjeta titulo="Referencias" subtitulo="Toca una referencia para registrar o cambiar su código de barras.">
              <Tabla columnas={columnas} filas={filtrado.slice(0, limite)} alClic={abrirProducto} vacio="No se encontraron productos" />
              {filtrado.length > limite && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
                  <Nota style={{ margin: 0 }}>
                    Se muestran {num(limite)} de {num(filtrado.length)}. Usa los filtros para acotar.
                  </Nota>
                  <Boton pequeno onClick={() => setLimite((l) => l + FILAS_POR_PAGINA)}>
                    Mostrar más
                  </Boton>
                </div>
              )}
            </Tarjeta>
          </>
        )}

        {modo === "detalle" && seleccionado && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", alignItems: "start" }}>
            <Tarjeta titulo={seleccionado.descripcion_corta}>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", margin: 0, fontSize: "14px" }}>
                <dt style={{ color: COLOR.gris }}>Referencia</dt>
                <dd style={{ margin: 0, ...mono, fontWeight: 600 }}>{seleccionado.codigo_interno}</dd>
                <dt style={{ color: COLOR.gris }}>Clasificación</dt>
                <dd style={{ margin: 0 }}>{insigniaAbc(seleccionado.clasificacion_abc)}</dd>
                <dt style={{ color: COLOR.gris }}>Unidad de empaque</dt>
                <dd style={{ margin: 0 }}>{seleccionado.unidad_empaque || "—"} unidades por caja</dd>
                <dt style={{ color: COLOR.gris }}>Código de barras</dt>
                <dd style={{ margin: 0 }}>{insigniaCodigo(seleccionado)}</dd>
              </dl>
            </Tarjeta>

            <Tarjeta titulo="Código de barras caja master (EAN14)">
              <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", cursor: "pointer", minHeight: "44px" }}>
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
                <span style={{ fontSize: "14px" }}>No aplica — se baja manual</span>
              </label>

              {!editando.sin_codigo_barras && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Campo etiqueta="EAN14 (14 dígitos)">
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={ean}
                        onChange={(e) => setEditando((ed) => ({ ...ed, ean14: e.target.value.replace(/\D/g, "") }))}
                        placeholder="Ej: 17709898161151"
                        maxLength={14}
                        style={{ ...estiloCampo, ...mono, flex: 1 }}
                      />
                      <Boton onClick={() => setEscaneando((v) => !v)}>{escaneando ? "Cancelar" : "Escanear"}</Boton>
                    </div>
                  </Campo>

                  {escaneando && (
                    <ScanInput
                      onScan={onEscanear}
                      label="Escanea el código de barras de la caja"
                      hint="El sistema elimina automáticamente el prefijo GS1 (01)"
                    />
                  )}

                  {ean.length === 14 && <Mensaje>EAN14 válido — 14 dígitos</Mensaje>}
                  {eanInvalido && (
                    <Mensaje tipo="error">El EAN14 debe tener 14 dígitos — actualmente tiene {ean.length}</Mensaje>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <Boton onClick={() => setModo("lista")}>Cancelar</Boton>
                <Boton variante="principal" onClick={guardar} disabled={cargando || eanInvalido}>
                  {cargando ? "Guardando..." : "Guardar"}
                </Boton>
              </div>
            </Tarjeta>
          </div>
        )}
      </Pagina>
    </Layout>
  );
}
