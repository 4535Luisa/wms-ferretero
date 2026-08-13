// Verificación de escaneo de código de barras reutilizable.
// Soporta dos formatos:
//   1. codigo_interno del catálogo (ej: "120363") — digitación manual o pistola
//   2. codigo_barras EAN-13/GTIN-13 real de la caja (ej: "7709031644636")
// Si el escaneo entrega un EAN-13, el sistema lo resuelve al codigo_interno
// correspondiente antes de comparar.

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
// el codigo_interno correspondiente, o el valor original si no lo encuentra.
async function resolverCodigoEscaneado(escaneada) {
  const raw = normalizarRef(escaneada);
  if (!raw) return raw;

  // Si tiene 8-14 dígitos numéricos, probablemente es un EAN-13
  const esEAN = /^\d{8,14}$/.test(raw);
  if (!esEAN) return raw;

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
    // best-effort: si falla, seguimos con el valor original
  }

  return raw;
}

// Registra el intento de escaneo en bitácora (trazabilidad).
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
        codigo_barras_raw: escaneada_raw ?? null,
        resultado,
        metodo: metodo ?? null,
      },
    });
  } catch {
    // trazabilidad best-effort
  }
}

// Verifica el escaneo y lo registra en un solo paso.
// Resuelve automáticamente EAN-13 → codigo_interno antes de comparar.
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
