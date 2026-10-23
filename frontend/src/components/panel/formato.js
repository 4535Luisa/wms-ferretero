// Formatos y colores compartidos por las pestañas del panel de control.

export const COLOR = {
  negro: "#0A0A0A",
  verde: "#00FF87",
  verdeTexto: "#007A40",
  verdeBarra: "#00A862",
  gris: "#4B5160",
  grisBarra: "#8A909C",
  borde: "#E2E4E8",
  bordeSuave: "#F0F1F3",
  fondo: "#F2F3F5",
  rojo: "#B91C1C",
  ambar: "#8A5A00",
  naranjaMeta: "#C2410C",
};

export const SEMAFORO = {
  ok: { texto: "En meta", bg: "#E3F7EC", fg: COLOR.verdeTexto, linea: COLOR.verdeBarra },
  cerca: { texto: "Cerca", bg: "#FFF4D6", fg: COLOR.ambar, linea: "#C28400" },
  bajo: { texto: "Bajo meta", bg: "#FDECEC", fg: COLOR.rojo, linea: COLOR.rojo },
};

// Igual que backend/src/utils/panel.js: "cerca" = a menos de un 15 %.
const MARGEN_CERCA = 0.15;
export function semaforo(actual, meta, sentido = "mayor") {
  if (actual == null || meta == null) return null;
  const a = Number(actual);
  const m = Number(meta);
  if (!Number.isFinite(a) || !Number.isFinite(m)) return null;
  if (sentido === "mayor") {
    if (a >= m) return "ok";
    return a >= m * (1 - MARGEN_CERCA) ? "cerca" : "bajo";
  }
  if (a <= m) return "ok";
  return a <= m * (1 + MARGEN_CERCA) ? "cerca" : "bajo";
}

const vacio = (n) => n == null || n === "" || Number.isNaN(Number(n));

export function num(n, dec = 0) {
  if (vacio(n)) return "—";
  return Number(n).toLocaleString("es-CO", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export const pct = (n, dec = 1) => (vacio(n) ? "—" : `${num(n, dec)} %`);

export function duracion(min) {
  if (vacio(min)) return "—";
  const m = Math.round(Number(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function haceTiempo(iso, ahora = Date.now()) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-10-20" → "20 oct"
export function diaCorto(ymd) {
  const [, m, d] = String(ymd).split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

// Fecha y hora en la zona de la bodega.
export function fechaHora(iso, tz) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fechaLocal(iso, tz) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CO", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Texto del rango, p. ej. "1 oct. 2026 – 20 oct. 2026".
export function textoRango(info) {
  if (!info?.desde) return "";
  const fin = new Date(new Date(info.hasta).getTime() - 1).toISOString();
  const a = fechaLocal(info.desde, info.zona_horaria);
  const b = fechaLocal(fin, info.zona_horaria);
  return a === b ? a : `${a} – ${b}`;
}

export const PERIODOS = {
  hoy: { etiqueta: "Hoy", compara: "vs. ayer" },
  semana: { etiqueta: "Esta semana", compara: "vs. semana anterior" },
  mes: { etiqueta: "Este mes", compara: "vs. mes anterior" },
  "7d": { etiqueta: "Últimos 7 días", compara: "vs. 7 días anteriores" },
  "14d": { etiqueta: "Últimos 14 días", compara: "vs. 14 días anteriores" },
  "30d": { etiqueta: "Últimos 30 días", compara: "vs. 30 días anteriores" },
  personalizado: { etiqueta: "Personalizado…", compara: "vs. periodo anterior" },
};

// Variación frente al periodo anterior, con color según si mejora o empeora.
//   modo "rel": % de cambio · "abs": diferencia · "pts": puntos porcentuales
export function variacion(actual, anterior, { modo = "rel", sentido = "mayor", dec = 0, compara }) {
  if (vacio(actual) || vacio(anterior)) return { texto: `Sin datos ${compara}`, color: COLOR.gris };
  const a = Number(actual);
  const b = Number(anterior);
  let d;
  let texto;
  if (modo === "rel") {
    if (b === 0) return { texto: `Sin datos ${compara}`, color: COLOR.gris };
    d = ((a - b) / b) * 100;
    texto = `${num(Math.abs(d), 0)} %`;
  } else {
    d = a - b;
    texto = `${num(Math.abs(d), dec)}${modo === "pts" ? " pts" : ""}`;
  }
  const redondeado = Number(Math.abs(d).toFixed(modo === "rel" ? 0 : dec));
  if (redondeado === 0) return { texto: `Igual ${compara}`, color: COLOR.gris };
  const signo = d > 0 ? "+" : "−";
  const mejora = sentido === "mayor" ? d > 0 : d < 0;
  return {
    texto: `${signo}${texto} ${compara}`,
    color: mejora ? COLOR.verdeTexto : COLOR.rojo,
  };
}

// Escala "bonita" para ejes: máximo redondeado hacia arriba.
export function maximoEje(valor) {
  if (!valor || valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  for (const paso of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (paso * potencia >= valor) return paso * potencia;
  }
  return 10 * potencia;
}
