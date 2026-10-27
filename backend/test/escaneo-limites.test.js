const { test, describe } = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://x.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "dummy-key";

const { normalizarRef, coincide, resolverCodigoEscaneado } = require("../src/utils/escaneo");

// Casos límite del escáner que no necesitan base de datos: lo que no parece
// un código de barras numérico se resuelve sin consultar Supabase.
describe("resolverCodigoEscaneado sin consultar la base", () => {
  test("vacío, espacios y null devuelven cadena vacía", async () => {
    assert.equal(await resolverCodigoEscaneado(""), "");
    assert.equal(await resolverCodigoEscaneado("   "), "");
    assert.equal(await resolverCodigoEscaneado(null), "");
    assert.equal(await resolverCodigoEscaneado(undefined), "");
  });

  test("referencia SIESA de 6 dígitos se usa tal cual", async () => {
    assert.equal(await resolverCodigoEscaneado(" 120363 "), "120363");
  });

  test("ubicación en minúscula se normaliza a mayúscula", async () => {
    assert.equal(await resolverCodigoEscaneado("b13-1"), "B13-1");
    assert.equal(await resolverCodigoEscaneado("ub-c12-1"), "UB-C12-1");
  });

  test("referencias alfanuméricas no se tratan como EAN", async () => {
    assert.equal(await resolverCodigoEscaneado("KIT-120A"), "KIT-120A");
  });

  test("texto con caracteres raros no rompe", async () => {
    assert.equal(await resolverCodigoEscaneado("ñ'%_,()"), "Ñ'%_,()");
  });
});

describe("coincide: casos límite", () => {
  test("números y textos equivalentes coinciden", () => {
    assert.equal(coincide(120363, "120363"), true);
  });
  test("ceros a la izquierda importan (no se recortan)", () => {
    assert.equal(coincide("0120363", "120363"), false);
  });
  test("nada coincide con una escaneada vacía", () => {
    assert.equal(coincide("120363", ""), false);
    assert.equal(coincide("", ""), false);
  });
  test("normalizarRef con números y objetos", () => {
    assert.equal(normalizarRef(42), "42");
    assert.equal(normalizarRef({ toString: () => " x " }), "X");
  });
});
