// Verificación de escaneo de código de barras reutilizable por los perfiles
// (montacarguista, operario, saldos). Cruza la referencia escaneada contra la
// que el perfil DEBE estar procesando y deja trazado el intento en bitácora.
// El barcode codifica el codigo_interno del catálogo, así que la comparación
// es textual (igual que la búsqueda de productos en recepción).
//
// supabase se carga de forma perezosa dentro de registrarEscaneo para que las
// funciones puras (normalizarRef/coincide) sean importables y testeables sin
// inicializar el cliente.

// Normaliza una referencia para comparar de forma robusta: sin espacios y en
// mayúsculas.
function normalizarRef(v) {
  return String(v ?? "").trim().toUpperCase();
}

function coincide(esperada, escaneada) {
  const a = normalizarRef(esperada);
  const b = normalizarRef(escaneada);
  return a !== "" && a === b;
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
  resultado,
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
        resultado, // "ok" | "mismatch" | "faltante"
      },
    });
  } catch {
    /* trazabilidad best-effort */
  }
}

// Verifica el escaneo y lo registra en un solo paso.
// Devuelve { ok, resultado } con resultado en "ok" | "mismatch" | "faltante".
async function verificarYRegistrar(opts) {
  const { escaneada, esperada } = opts;
  let resultado;
  if (escaneada === undefined || escaneada === null || String(escaneada).trim() === "") {
    resultado = "faltante";
  } else if (coincide(esperada, escaneada)) {
    resultado = "ok";
  } else {
    resultado = "mismatch";
  }
  await registrarEscaneo({ ...opts, resultado });
  return { ok: resultado === "ok", resultado };
}

module.exports = { normalizarRef, coincide, registrarEscaneo, verificarYRegistrar };
