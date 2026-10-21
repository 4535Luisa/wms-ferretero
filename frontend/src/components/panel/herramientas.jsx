import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../services/api";
import { COLOR } from "./formato";

// Estilos, hooks y utilidades compartidos por las pestañas del panel.

export const estiloTarjeta = {
  background: "#FFFFFF",
  border: `1px solid ${COLOR.borde}`,
  borderRadius: "12px",
  padding: "20px",
  minWidth: 0,
  boxSizing: "border-box",
};

export const estiloBoton = (oscuro) => ({
  font: "inherit",
  fontSize: "14px",
  fontWeight: 600,
  padding: "10px 16px",
  minHeight: "44px",
  borderRadius: "8px",
  border: `1px solid ${COLOR.negro}`,
  background: oscuro ? COLOR.negro : "#FFFFFF",
  color: oscuro ? "#FFFFFF" : COLOR.negro,
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  cursor: "pointer",
});

// Tooltip flotante para barras y puntos. Devuelve [propsPara(texto), nodo].
export function useTip() {
  const [tip, setTip] = useState(null);
  const propsPara = (texto) => ({
    tabIndex: 0,
    "aria-label": texto,
    onMouseEnter: (e) => setTip({ texto, x: e.clientX, y: e.clientY }),
    onMouseMove: (e) => setTip({ texto, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTip(null),
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ texto, x: r.left + r.width / 2, y: r.top });
    },
    onBlur: () => setTip(null),
  });
  const nodo = tip ? (
    <div
      role="tooltip"
      className="panel-no-print"
      style={{
        position: "fixed",
        left: Math.min(tip.x + 12, window.innerWidth - 240),
        top: tip.y + 14,
        zIndex: 1000,
        background: COLOR.negro,
        color: "#FFFFFF",
        fontSize: "13px",
        lineHeight: 1.4,
        padding: "8px 10px",
        borderRadius: "8px",
        maxWidth: "220px",
        pointerEvents: "none",
        whiteSpace: "pre-line",
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      {tip.texto}
    </div>
  ) : null;
  return [propsPara, nodo];
}

// Carga un endpoint del panel con sus parámetros; `refrescoMs` lo recarga solo.
export function useDatosPanel(ruta, params, { refrescoMs, activo = true } = {}) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  const clave = JSON.stringify(params);
  const ultimo = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++ultimo.current;
    try {
      const { data } = await api.get(ruta, { params: JSON.parse(clave) });
      if (n === ultimo.current) setEstado({ datos: data, error: null, cargando: false });
    } catch (e) {
      if (n === ultimo.current)
        setEstado((s) => ({
          ...s,
          cargando: false,
          error: e.response?.data?.error || "No se pudo cargar el panel. Revisa la conexión.",
        }));
    }
  }, [ruta, clave]);

  useEffect(() => {
    if (!activo) return undefined;
    setEstado((s) => ({ ...s, cargando: true }));
    cargar();
    if (!refrescoMs) return undefined;
    const id = setInterval(cargar, refrescoMs);
    return () => clearInterval(id);
  }, [cargar, refrescoMs, activo]);

  return { ...estado, recargar: cargar };
}

// Parámetros de consulta a partir del estado del selector de periodo.
export function paramsPeriodo(p) {
  if (p.periodo === "personalizado") return { periodo: p.periodo, desde: p.desde, hasta: p.hasta };
  return { periodo: p.periodo };
}

// Excel con varias hojas: [{ nombre, filas: [{ columna: valor }] }].
export async function descargarExcel(archivo, hojas) {
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const filas = h.filas.length > 0 ? h.filas : [{ "Sin datos": "" }];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), h.nombre.slice(0, 31));
  }
  XLSX.writeFile(libro, archivo);
}

// "Guardar como PDF" desde el diálogo de impresión del navegador.
export function imprimir(titulo) {
  const anterior = document.title;
  document.title = titulo;
  const restaurar = () => {
    document.title = anterior;
    window.removeEventListener("afterprint", restaurar);
  };
  window.addEventListener("afterprint", restaurar);
  window.print();
}
