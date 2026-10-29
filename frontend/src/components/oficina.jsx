import { COLOR } from "./panel/formato";
import { estiloTarjeta } from "./panel/herramientas";

// Piezas comunes de las pantallas de oficina, con el mismo estilo que el
// panel de control. Las tarjetas y cifras se reutilizan del panel.
export { Tarjeta, Kpi, FilaKpis, Pastilla, Nota } from "./panel/ui";

// Estilos de las tablas (van en la página: index.css no se carga en la app).
const ESTILOS = `
  .of-tabla-envoltura {
    overflow-x: auto;
  }
  .of-tabla {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .of-tabla th {
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #4b5160;
    border-bottom: 1px solid #e2e4e8;
    white-space: nowrap;
  }
  .of-tabla td {
    padding: 12px;
    border-bottom: 1px solid #f0f1f3;
    vertical-align: middle;
  }
  .of-tabla tbody tr:last-child td {
    border-bottom: none;
  }
  .of-tabla tbody tr:hover td {
    background: #fafbfc;
  }
  .of-tabla .of-num {
    text-align: right;
    font-family: "DM Mono", monospace;
  }
  @media (max-width: 720px) {
    .of-tabla thead {
      display: none;
    }
    .of-tabla,
    .of-tabla tbody,
    .of-tabla tr,
    .of-tabla td {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .of-tabla tr {
      box-sizing: border-box;
      border: 1px solid #e2e4e8;
      border-radius: 10px;
      padding: 8px 12px;
      margin-bottom: 8px;
    }
    .of-tabla td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-bottom: none;
      text-align: right;
    }
    .of-tabla td::before {
      content: attr(data-titulo);
      font-size: 12px;
      font-weight: 600;
      color: #4b5160;
      text-align: left;
      flex-shrink: 0;
      font-family: "Outfit", sans-serif;
    }
    .of-tabla td[data-titulo=""]::before {
      content: none;
    }
  }
  .of-tabla tbody tr.of-sel td {
    background: rgba(0, 255, 135, 0.1);
  }
`;

export function Pagina({ children }) {
  return (
    <div
      className="of-pagina"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "1440px",
        margin: "0 auto",
        color: COLOR.negro,
      }}
    >
      <style>{ESTILOS}</style>
      {children}
    </div>
  );
}

// Fila de botones de la página (crear, volver, cambiar de vista…).
export function Acciones({ children }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
      {children}
    </div>
  );
}

const VARIANTES = {
  principal: { background: COLOR.negro, color: "#FFFFFF", border: `1px solid ${COLOR.negro}` },
  verde: { background: COLOR.verde, color: COLOR.negro, border: `1px solid ${COLOR.verde}` },
  secundario: { background: "#FFFFFF", color: COLOR.negro, border: "1px solid #C9CDD4" },
  peligro: { background: "#FFFFFF", color: COLOR.rojo, border: "1px solid #F3C4C4" },
  peligroLleno: { background: COLOR.rojo, color: "#FFFFFF", border: `1px solid ${COLOR.rojo}` },
};

export function Boton({ variante = "secundario", pequeno, style, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        font: "inherit",
        fontSize: pequeno ? "13px" : "14px",
        fontWeight: 600,
        padding: pequeno ? "6px 12px" : "10px 16px",
        minHeight: pequeno ? "36px" : "44px",
        borderRadius: "8px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        whiteSpace: "nowrap",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.55 : 1,
        ...VARIANTES[variante],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Pestañas de vista dentro de una página (fondo negro, como el panel).
export function Pestanas({ opciones, valor, onChange }) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        background: COLOR.negro,
        borderRadius: "12px",
        padding: "6px",
      }}
    >
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(o.valor)}
            style={{
              font: "inherit",
              fontSize: "14px",
              fontWeight: activa ? 600 : 500,
              padding: "8px 16px",
              minHeight: "40px",
              border: "none",
              borderRadius: "8px",
              background: activa ? COLOR.verde : "transparent",
              color: activa ? COLOR.negro : "#FFFFFF",
              cursor: "pointer",
            }}
          >
            {o.texto}
            {o.cuenta != null && (
              <span style={{ marginLeft: "6px", fontFamily: "'DM Mono', monospace", opacity: 0.75 }}>
                {o.cuenta}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Campo({ etiqueta, children, ancho, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: ancho, flex: ancho ? `1 1 ${ancho}` : undefined, ...style }}>
      <span style={{ fontSize: "12px", fontWeight: 600, color: COLOR.gris }}>{etiqueta}</span>
      {children}
    </label>
  );
}

// Barra de filtros: tarjeta blanca con los campos en línea.
export function Filtros({ children }) {
  return (
    <section
      aria-label="Filtros"
      style={{
        ...estiloTarjeta,
        padding: "14px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "12px",
      }}
    >
      {children}
    </section>
  );
}

export function Mensaje({ tipo = "ok", children }) {
  if (!children) return null;
  const c =
    tipo === "error"
      ? { bg: "#FDECEC", fg: COLOR.rojo, borde: "#F3C4C4" }
      : tipo === "aviso"
        ? { bg: "#FFF4D6", fg: COLOR.ambar, borde: "#F2DFA6" }
        : { bg: "#E3F7EC", fg: COLOR.verdeTexto, borde: "#BCE8CF" };
  return (
    <div
      className="of-mensaje"
      role={tipo === "error" ? "alert" : "status"}
      style={{
        // Fijo bajo la barra superior: el resultado de un escaneo se ve
        // aunque se haya bajado en la lista.
        position: "sticky",
        top: "64px",
        zIndex: 50,
        background: c.bg,
        color: c.fg,
        border: `2px solid ${c.borde}`,
        borderRadius: "10px",
        padding: "12px 14px",
        fontSize: "15px",
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );
}

export function Vacio({ children }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "14px", color: COLOR.gris }}>
      {children}
    </div>
  );
}

// Tabla de escritorio que en el celular se convierte en una ficha por fila.
// columnas: [{ titulo, celda: (fila) => nodo, num?, ancho? }]
export function Tabla({ columnas, filas, clave = "id", vacio = "Sin resultados", alClic, seleccionada }) {
  if (filas.length === 0) return <Vacio>{vacio}</Vacio>;
  return (
    <div className="of-tabla-envoltura">
      <table className="of-tabla">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={i} scope="col" style={{ textAlign: c.num ? "right" : "left", width: c.ancho }}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr
              key={typeof clave === "function" ? clave(f, i) : f[clave]}
              onClick={alClic ? () => alClic(f) : undefined}
              className={seleccionada?.(f) ? "of-sel" : undefined}
              style={alClic ? { cursor: "pointer" } : undefined}
            >
              {columnas.map((c, j) => (
                <td
                  key={j}
                  data-titulo={c.titulo}
                  className={c.num ? "of-num" : undefined}
                >
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Ventana sobre la página. `acciones` va abajo a la derecha.
export function Modal({ titulo, subtitulo, children, acciones, onCerrar, ancho = "420px" }) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.5)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{
          background: "#FFFFFF",
          borderRadius: "14px",
          padding: "24px",
          width: "100%",
          maxWidth: ancho,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
          color: COLOR.negro,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{titulo}</h2>
        {subtitulo && <p style={{ margin: "6px 0 0", fontSize: "14px", color: COLOR.gris }}>{subtitulo}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "18px" }}>{children}</div>
        {acciones && (
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "22px" }}>
            {acciones}
          </div>
        )}
      </div>
    </div>
  );
}

// Barra de avance fina (cajas verificadas, progreso de picking…).
export function Progreso({ valor, total, color = COLOR.verdeBarra }) {
  const p = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ background: COLOR.bordeSuave, borderRadius: "4px", height: "6px", overflow: "hidden" }}
    >
      <div style={{ background: color, height: "100%", width: `${p}%`, transition: "width 0.3s" }} />
    </div>
  );
}
