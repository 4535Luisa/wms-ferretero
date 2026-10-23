// Rangos de fechas del panel de control, calculados en la hora local de la
// bodega (no en la del servidor, que en Render corre en UTC). Cada rango es
// [desde, hasta) y trae el rango anterior equivalente para comparar.
const TZ = process.env.PANEL_TZ || "America/Bogota";

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERSONALIZADO = 366;

// Fecha y hora de pared en `tz` para un instante.
function partesLocales(instante, tz = TZ) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(instante);
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return {
    y: Number(v.year),
    m: Number(v.month),
    d: Number(v.day),
    h: Number(v.hour),
    mi: Number(v.minute),
    s: Number(v.second),
    // 0 = lunes … 6 = domingo
    diaSemana: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      v.weekday,
    ),
  };
}

// Diferencia (ms) entre la hora de pared en `tz` y UTC en ese instante.
function desfase(instante, tz) {
  const p = partesLocales(instante, tz);
  const comoUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return comoUTC - Math.floor(instante.getTime() / 1000) * 1000;
}

// Instante en que empieza el día local y-m-d (m 1..12; admite desbordes,
// p. ej. d = 0 o m = 13, que Date.UTC normaliza).
function inicioDia(y, m, d, tz = TZ) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - desfase(new Date(guess), tz);
  // Segundo ajuste por si el desfase cambia ese día (horario de verano).
  t = guess - desfase(new Date(t), tz);
  return new Date(t);
}

function fechaYMD(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(y, mo - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d)
    return null;
  return { y, m: mo, d };
}

const PERIODOS = ["hoy", "semana", "mes", "7d", "14d", "30d", "personalizado"];

// Devuelve { periodo, desde, hasta, prevDesde, prevHasta } (Date) o
// { error } si el periodo pedido no es válido.
function calcularPeriodo(
  { periodo, desde, hasta } = {},
  ahora = new Date(),
  tz = TZ,
) {
  const p = partesLocales(ahora, tz);
  const hoy = inicioDia(p.y, p.m, p.d, tz);
  let r;

  switch (periodo) {
    case "hoy": {
      const ayer = inicioDia(p.y, p.m, p.d - 1, tz);
      r = { desde: hoy, hasta: ahora, prevDesde: ayer };
      break;
    }
    case "semana": {
      const lunes = inicioDia(p.y, p.m, p.d - p.diaSemana, tz);
      const lunesAnt = inicioDia(p.y, p.m, p.d - p.diaSemana - 7, tz);
      r = { desde: lunes, hasta: ahora, prevDesde: lunesAnt };
      break;
    }
    case "mes": {
      const uno = inicioDia(p.y, p.m, 1, tz);
      const unoAnt = inicioDia(p.y, p.m - 1, 1, tz);
      r = { desde: uno, hasta: ahora, prevDesde: unoAnt };
      break;
    }
    case "7d":
    case "14d":
    case "30d": {
      const n = parseInt(periodo, 10);
      const ini = inicioDia(p.y, p.m, p.d - (n - 1), tz);
      const iniAnt = inicioDia(p.y, p.m, p.d - (2 * n - 1), tz);
      r = { desde: ini, hasta: ahora, prevDesde: iniAnt, prevHasta: ini };
      break;
    }
    case "personalizado": {
      const a = fechaYMD(desde);
      const b = fechaYMD(hasta);
      if (!a || !b) return { error: "Fechas inválidas (formato AAAA-MM-DD)" };
      const ini = inicioDia(a.y, a.m, a.d, tz);
      const fin = inicioDia(b.y, b.m, b.d + 1, tz);
      if (fin <= ini) return { error: "La fecha final es anterior a la inicial" };
      if (fin - ini > MAX_DIAS_PERSONALIZADO * DIA_MS + 2 * 60 * 60 * 1000)
        return { error: `El rango no puede pasar de ${MAX_DIAS_PERSONALIZADO} días` };
      const dur = fin - ini;
      r = {
        desde: ini,
        hasta: fin,
        prevDesde: new Date(ini - dur),
        prevHasta: ini,
      };
      break;
    }
    default:
      return { error: "Periodo inválido" };
  }

  // Comparación "a la misma altura": el rango anterior dura lo mismo, sin
  // pasar del inicio del rango actual.
  if (!r.prevHasta) {
    const fin = new Date(r.prevDesde.getTime() + (r.hasta - r.desde));
    r.prevHasta = fin > r.desde ? r.desde : fin;
  }
  return { periodo, ...r };
}

// Las últimas `n` semanas (lunes a lunes), de la más antigua a la actual; la
// actual termina en `ahora`.
function ultimasSemanas(n, ahora = new Date(), tz = TZ) {
  const p = partesLocales(ahora, tz);
  const semanas = [];
  for (let i = n - 1; i >= 0; i--) {
    const desde = inicioDia(p.y, p.m, p.d - p.diaSemana - 7 * i, tz);
    const hasta =
      i === 0 ? ahora : inicioDia(p.y, p.m, p.d - p.diaSemana - 7 * (i - 1), tz);
    semanas.push({ desde, hasta });
  }
  return semanas;
}

module.exports = {
  TZ,
  PERIODOS,
  partesLocales,
  inicioDia,
  calcularPeriodo,
  ultimasSemanas,
};
