import { useState } from "react";
import { COLOR, PERIODOS, SEMAFORO } from "./formato";
import { estiloBoton, estiloTarjeta } from "./herramientas";

const estiloH2 = { margin: 0, fontSize: "18px", fontWeight: 700 };

export function Tarjeta({ titulo, extra, children, style, id }) {
  const idTitulo = id ? `t-${id}` : undefined;
  return (
    <section
      className="panel-seccion"
      aria-labelledby={idTitulo}
      style={{ ...estiloTarjeta, ...style }}
    >
      {(titulo || extra) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          {titulo && (
            <h2 id={idTitulo} style={estiloH2}>
              {titulo}
            </h2>
          )}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function Nota({ children, style }) {
  return (
    <p style={{ margin: "12px 0 0", fontSize: "13px", color: COLOR.gris, lineHeight: 1.45, ...style }}>
      {children}
    </p>
  );
}

export function FilaKpis({ children, etiqueta }) {
  return (
    <section
      aria-label={etiqueta}
      className="panel-seccion"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: "16px",
      }}
    >
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, pie, colorPie = COLOR.gris, colorValor }) {
  return (
    <div
      style={{
        ...estiloTarjeta,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <span style={{ fontSize: "13px", fontWeight: 600, color: COLOR.gris }}>{etiqueta}</span>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "34px",
          fontWeight: 500,
          lineHeight: 1.1,
          color: colorValor || COLOR.negro,
        }}
      >
        {valor}
      </span>
      {pie && <span style={{ fontSize: "13px", fontWeight: 600, color: colorPie }}>{pie}</span>}
    </div>
  );
}

export function Insignia({ estado, texto }) {
  const s = SEMAFORO[estado];
  if (!s)
    return <span style={{ fontSize: "13px", color: COLOR.gris }}>{texto || "Sin datos"}</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px",
        background: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.fg }} />
      {texto || s.texto}
    </span>
  );
}

export function Pastilla({ texto, bg, fg }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px",
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: fg }} />
      {texto}
    </span>
  );
}

export function Leyenda({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "13px", color: COLOR.gris }}>
      {items.map((it) => (
        <span key={it.texto} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            aria-hidden="true"
            style={
              it.linea
                ? { width: "18px", height: 0, borderTop: `2px ${it.discontinua ? "dashed" : "solid"} ${it.color}` }
                : { width: "12px", height: "12px", background: it.color, borderRadius: "2px" }
            }
          />
          {it.texto}
        </span>
      ))}
    </div>
  );
}

const estiloCampo = {
  font: "inherit",
  fontSize: "14px",
  padding: "8px 10px",
  minHeight: "40px",
  border: "1px solid #C9CDD4",
  borderRadius: "8px",
  background: "#FFFFFF",
  color: COLOR.negro,
  boxSizing: "border-box",
};

export function Campo({ id, etiqueta, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label htmlFor={id} style={{ fontSize: "12px", fontWeight: 600, color: COLOR.gris }}>
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

export function Selector({ id, etiqueta, valor, onChange, opciones, minWidth = 150 }) {
  return (
    <Campo id={id} etiqueta={etiqueta}>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...estiloCampo, minWidth }}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Campo>
  );
}

// Selector de periodo con fechas propias para "Personalizado…".
export function SelectorPeriodo({ id, periodos, valor, onChange }) {
  const [desde, setDesde] = useState(valor.desde || "");
  const [hasta, setHasta] = useState(valor.hasta || "");
  return (
    <>
      <Selector
        id={id}
        etiqueta="Periodo"
        valor={valor.periodo}
        minWidth={170}
        onChange={(p) => {
          if (p !== "personalizado") onChange({ periodo: p });
          else if (desde && hasta) onChange({ periodo: p, desde, hasta });
          else onChange({ ...valor, periodo: p, pendiente: true });
        }}
        opciones={periodos.map((p) => ({ valor: p, texto: PERIODOS[p].etiqueta }))}
      />
      {valor.periodo === "personalizado" && (
        <>
          <Campo id={`${id}-desde`} etiqueta="Desde">
            <input
              id={`${id}-desde`}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={estiloCampo}
            />
          </Campo>
          <Campo id={`${id}-hasta`} etiqueta="Hasta">
            <input
              id={`${id}-hasta`}
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              style={estiloCampo}
            />
          </Campo>
          <button
            type="button"
            disabled={!desde || !hasta}
            onClick={() => onChange({ periodo: "personalizado", desde, hasta })}
            style={{ ...estiloBoton(false), opacity: !desde || !hasta ? 0.5 : 1 }}
          >
            Aplicar
          </button>
        </>
      )}
    </>
  );
}

const IconoDescarga = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);
const IconoPdf = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </svg>
);

export function BarraFiltros({ children, onExcel, onPdf, ocupado }) {
  return (
    <section
      aria-label="Filtros"
      className="panel-no-print"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "16px",
        ...estiloTarjeta,
        padding: "16px 20px",
      }}
    >
      {children}
      <div style={{ flex: "1 1 auto" }} />
      {onExcel && (
        <button type="button" onClick={onExcel} disabled={ocupado} style={estiloBoton(false)}>
          <IconoDescarga />
          {ocupado ? "Preparando…" : "Descargar Excel"}
        </button>
      )}
      {onPdf && (
        <button type="button" onClick={onPdf} style={estiloBoton(true)}>
          <IconoPdf />
          Informe PDF
        </button>
      )}
    </section>
  );
}

export function BotonPequeno({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      className="panel-no-print"
      onClick={onClick}
      disabled={disabled}
      style={{
        font: "inherit",
        fontSize: "13px",
        fontWeight: 600,
        padding: "6px 12px",
        minHeight: "36px",
        borderRadius: "8px",
        border: "1px solid #C9CDD4",
        background: "#FFFFFF",
        color: COLOR.negro,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function Aviso({ tipo = "info", children }) {
  const colores =
    tipo === "error"
      ? { bg: "#FDECEC", fg: COLOR.rojo }
      : { bg: "#FFFFFF", fg: COLOR.gris };
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      style={{
        ...estiloTarjeta,
        background: colores.bg,
        color: colores.fg,
        fontSize: "14px",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

