const { test, describe } = require("node:test");
const assert = require("node:assert");
const { normalizarRef, coincide } = require("../src/utils/escaneo");

describe("normalizarRef", () => {
  test("quita espacios y pasa a mayúsculas", () => {
    assert.equal(normalizarRef("  abc123 "), "ABC123");
    assert.equal(normalizarRef("120212"), "120212");
  });
  test("maneja null/undefined sin romper", () => {
    assert.equal(normalizarRef(null), "");
    assert.equal(normalizarRef(undefined), "");
  });
});

describe("coincide", () => {
  test("coincide ignorando mayúsculas y espacios", () => {
    assert.equal(coincide("120212", " 120212 "), true);
    assert.equal(coincide("abc-9", "ABC-9"), true);
  });
  test("no coincide con referencias distintas", () => {
    assert.equal(coincide("120212", "120213"), false);
  });
  test("una referencia esperada vacía nunca coincide", () => {
    assert.equal(coincide("", ""), false);
    assert.equal(coincide(null, "120212"), false);
  });
});
