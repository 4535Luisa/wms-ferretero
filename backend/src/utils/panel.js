// Metas del panel de control: definición, semáforo y focos de atención.

const METAS = [
  {
    clave: "pedidos_dia_operario",
    nombre: "Pedidos por día por operario",
    sentido: "mayor",
    unidad: "pedidos",
    porDefecto: 8,
  },
  {
    clave: "tiempo_medio_pedido_min",
    nombre: "Tiempo medio por pedido",
    sentido: "menor",
    unidad: "min",
    porDefecto: 50,
  },
  {
    clave: "errores_escaneo_pct",
    nombre: "Errores de escaneo",
    sentido: "menor",
    unidad: "%",
    porDefecto: 1.5,
  },
  {
    clave: "fuera_hora_limite_dia",
    nombre: "Pedidos fuera de hora límite",
    sentido: "menor",
    unidad: "por día",
    porDefecto: 2,
  },
  {
    clave: "espera_verificacion_min",
    nombre: "Espera de verificación",
    sentido: "menor",
    unidad: "min",
    porDefecto: 90,
  },
];

const CLAVES_METAS = METAS.map((m) => m.clave);
const SENTIDO = Object.fromEntries(METAS.map((m) => [m.clave, m.sentido]));

// "Cerca" = a menos de un 15 % de la meta.
const MARGEN_CERCA = 0.15;

// "ok" | "cerca" | "bajo", o null si no hay dato.
function semaforo(actual, meta, sentido) {
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

const num = (n, dec = 1) =>
  Number(n).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec,
  });

function duracion(min) {
  const m = Math.round(Number(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function listaNombres(nombres) {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

const MAX_FOCOS = 5;

// Focos de atención a partir de los datos de una semana cerrada.
//   indicadores: salida de panel_indicadores
//   metas: { clave: valor }
//   operarios: panel_operarios().operarios
//   faltantes: panel_flujo().faltantes
//   agotadas: número de referencias agotadas en picking
function generarFocos({ indicadores, metas, operarios, faltantes, agotadas }) {
  const focos = [];
  const ind = indicadores || {};
  const estado = (clave) => semaforo(ind[clave], metas[clave], SENTIDO[clave]);

  if (estado("espera_verificacion_min") === "bajo") {
    const a = ind.espera_verificacion_min;
    focos.push({
      tipo: "flujo",
      titulo: "La verificación es el cuello de botella",
      detalle: `Los pedidos esperaron ${duracion(a)} entre el cierre del operario y la verificación, ${duracion(a - metas.espera_verificacion_min)} más que la meta.`,
      accion:
        "repartir la verificación en franjas fijas o reforzarla en las horas pico.",
    });
  }

  if (estado("fuera_hora_limite_dia") === "bajo") {
    focos.push({
      tipo: "flujo",
      titulo: "Pedidos fuera de hora límite",
      detalle: `Se cerraron ${num(ind.fuera_hora_limite_dia)} pedidos por día después de su hora límite; la meta es ${num(metas.fuera_hora_limite_dia)}.`,
      accion:
        "asignar primero los pedidos con la hora límite más próxima.",
    });
  }

  const meta = metas.pedidos_dia_operario;
  const bajos = (operarios || [])
    .filter((o) => o.pedidos > 0 && o.dias > 0)
    .map((o) => ({
      ...o,
      porDia: o.pedidos / o.dias,
      errPct: o.escaneos > 0 ? (100 * o.errores) / o.escaneos : null,
    }))
    .filter((o) => semaforo(o.porDia, meta, "mayor") === "bajo")
    .sort((a, b) => a.porDia - b.porDia);
  if (bajos.length > 0) {
    const muestra = bajos.slice(0, 3);
    const resto = bajos.length - muestra.length;
    const nombres = muestra.map((o) => o.nombre);
    if (resto > 0) nombres.push(`${resto} más`);
    const conErrores = muestra.filter((o) => o.errPct != null);
    focos.push({
      tipo: "operarios",
      titulo: `${listaNombres(nombres)} bajo la meta`,
      detalle:
        `Promedian ${listaNombres(muestra.map((o) => num(o.porDia)))} pedidos/día (meta ${num(meta)})` +
        (conErrores.length === muestra.length
          ? `, con ${listaNombres(conErrores.map((o) => `${num(o.errPct)} %`))} de errores de escaneo.`
          : "."),
      accion:
        "acompañamiento en piso y revisar las referencias donde más fallan.",
    });
  }

  if (estado("tiempo_medio_pedido_min") === "bajo") {
    focos.push({
      tipo: "operarios",
      titulo: "Tiempo por pedido por encima de la meta",
      detalle: `El tiempo medio de asignación a cierre fue ${duracion(ind.tiempo_medio_pedido_min)}; la meta es ${duracion(metas.tiempo_medio_pedido_min)}.`,
      accion:
        "revisar los pedidos más lentos y si las cajas llegaron a tiempo.",
    });
  }

  if (estado("errores_escaneo_pct") === "bajo") {
    focos.push({
      tipo: "operarios",
      titulo: "Errores de escaneo por encima de la meta",
      detalle: `${num(ind.errores_escaneo_pct)} % de los escaneos fueron incorrectos; la meta es ${num(metas.errores_escaneo_pct)} %.`,
      accion:
        "revisar etiquetas y códigos de barras de las referencias con más fallos.",
    });
  }

  const peor = faltantes?.top?.[0];
  if (peor && peor.veces >= 2) {
    focos.push({
      tipo: "mercancia",
      titulo: `${peor.referencia} acumula faltantes`,
      detalle: `${peor.veces} faltantes de stock al generar listas, ${num(peor.cajas, 0)} cajas en total.`,
      accion: "conteo cíclico de la referencia y revisar su reposición.",
    });
  }

  if (agotadas > 0) {
    focos.push({
      tipo: "mercancia",
      titulo: `${num(agotadas, 0)} ${agotadas === 1 ? "referencia agotada" : "referencias agotadas"} en picking`,
      detalle:
        "Tuvieron pedidos y no tienen unidades disponibles en B8, B36 ni B7.",
      accion: "reponer desde las otras bodegas, empezando por las más pedidas.",
    });
  }

  return focos.slice(0, MAX_FOCOS);
}

module.exports = {
  METAS,
  CLAVES_METAS,
  MARGEN_CERCA,
  semaforo,
  generarFocos,
  duracion,
};
