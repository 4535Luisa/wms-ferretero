// Verificación de escaneo de código de barras reutilizable por los perfiles
// (montacarguista, operario, saldos). Cruza la referencia escaneada contra la
// que el perfil DEBE estar procesando. Soporta dos formatos:
//   1. codigo_interno del catálogo (ej: "120363") — digitación manual o pistola
//   2. codigo_barras EAN-13/GTIN-13 real de la caja (ej: "7708994141510")
// Si el escaneo entrega un EAN-13, el sistema lo resuelve al codigo_interno
// correspondiente antes de comparar. El intento queda trazado en bitácora.

// Normaliza una referencia para comparar de forma robusta: sin espacios y en
// mayúsculas.
function normalizarRef(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

function coincide(esperada, escaneada) {
  const a = normalizarRef(esperada);
  const b = normalizarRef(escaneada);
  return a !== "" && a === b;
}

// Resuelve lo que el usuario escaneó a un codigo_interno.
// Si escaneó el codigo_interno directamente → lo devuelve tal cual.
// Si escaneó un EAN-13/GTIN → busca en productos.codigo_barras y devuelve
// el codigo_interno correspondiente, o null si no lo encuentra.
// Best-effort: si la BD falla devuelve el valor original para no bloquear.
async function resolverCodigoEscaneado(escaneada) {
  const raw = normalizarRef(escaneada);
  if (!raw) return raw;

  // Si tiene más de 8 caracteres y es solo números, probablemente es un EAN-13
  const esEAN = /^\d{8,14}$/.test(raw);
  if (!esEAN) return raw; // codigo_interno — devolver tal cual

  try {
    const supabase = require("./supabase");
    const { data } = await supabase
      .from("productos")
      .select("codigo_interno")
      .eq("codigo_barras", raw)
      .eq("activo", true)
      .single();
    if (data?.codigo_interno) return normalizarRef(data.codigo_interno);
  } catch {
    /* best-effort: si falla, seguimos con el valor original */
  }

  return raw; // No se encontró → devolver original para que el backend lo rechace
}

// Registra el intento de escaneo en bitácora (trazabilidad: usuario, referencia
// esperada, escaneada y resultado; el timestamp lo pone la BD). Best-effort: el
// registro de trazabilidad nunca debe tumbar la operación principal.
async function registrarEscaneo({
  usuario_id,
  tabla,
  registro_id,
  esperada,
  escaneada,
  escaneada_raw,
  resultado,
  metodo,
}) {
  try {
    const supabase = require("./supabase");
    await supabase.from("bitacora").insert({
      usuario_id: usuario_id || null,
      accion: "ESCANEO_VERIFICACION",
      tabla,
      registro_id,
      valores_despues: {
        referencia_esperada: esperada ?? null,
        referencia_escaneada: escaneada ?? null,
        codigo_barras_raw: escaneada_raw ?? null, // EAN-13 original si aplica
        resultado, // "ok" | "mismatch" | "faltante"
        metodo: metodo ?? null, // "camara" | "teclado" | null
      },
    });
  } catch {
    /* trazabilidad best-effort */
  }
}

// Verifica el escaneo y lo registra en un solo paso.
// Resuelve automáticamente EAN-13 → codigo_interno antes de comparar.
// Devuelve { ok, resultado } con resultado en "ok" | "mismatch" | "faltante".
async function verificarYRegistrar(opts) {
  const { escaneada, esperada } = opts;

  let resultado;
  let escaneadaResuelta = escaneada;

  if (
    escaneada === undefined ||
    escaneada === null ||
    String(escaneada).trim() === ""
  ) {
    resultado = "faltante";
  } else {
    // Resolver EAN-13 → codigo_interno si aplica
    escaneadaResuelta = await resolverCodigoEscaneado(escaneada);

    if (coincide(esperada, escaneadaResuelta)) {
      resultado = "ok";
    } else {
      resultado = "mismatch";
    }
  }

  await registrarEscaneo({
    ...opts,
    escaneada: escaneadaResuelta,
    escaneada_raw: escaneada !== escaneadaResuelta ? escaneada : null,
    resultado,
  });

  return { ok: resultado === "ok", resultado, escaneadaResuelta };
}

module.exports = {
  normalizarRef,
  coincide,
  resolverCodigoEscaneado,
  registrarEscaneo,
  verificarYRegistrar,
};
