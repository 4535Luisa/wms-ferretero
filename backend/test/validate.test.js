const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  isUuid,
  isEmail,
  toFiniteNumber,
  requireUuidParam,
} = require("../src/utils/validate");

describe("isUuid", () => {
  test("acepta un UUID válido", () => {
    assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  });
  test("rechaza strings inválidos y no-strings", () => {
    assert.equal(isUuid("nope"), false);
    assert.equal(isUuid(""), false);
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(123), false);
  });
});

describe("isEmail", () => {
  test("acepta emails válidos", () => {
    assert.equal(isEmail("a@b.co"), true);
    assert.equal(isEmail("juan.perez@empresa.com.co"), true);
  });
  test("rechaza inválidos", () => {
    assert.equal(isEmail("bad"), false);
    assert.equal(isEmail("a@b"), false);
    assert.equal(isEmail("a @b.co"), false);
    assert.equal(isEmail(null), false);
  });
});

describe("toFiniteNumber", () => {
  test("convierte números y strings numéricos", () => {
    assert.equal(toFiniteNumber("5"), 5);
    assert.equal(toFiniteNumber(0), 0);
    assert.equal(toFiniteNumber(-3.5), -3.5);
  });
  test("devuelve null para valores no numéricos", () => {
    assert.equal(toFiniteNumber("abc"), null);
    assert.equal(toFiniteNumber(""), null);
    assert.equal(toFiniteNumber(null), null);
    assert.equal(toFiniteNumber(undefined), null);
    assert.equal(toFiniteNumber(Infinity), null);
    assert.equal(toFiniteNumber(NaN), null);
  });
});

describe("requireUuidParam", () => {
  const mkRes = () => ({
    statusCode: null,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  });

  test("llama next() con UUID válido", () => {
    const mw = requireUuidParam("id");
    const req = { params: { id: "123e4567-e89b-12d3-a456-426614174000" } };
    const res = mkRes();
    let llamado = false;
    mw(req, res, () => {
      llamado = true;
    });
    assert.equal(llamado, true);
    assert.equal(res.statusCode, null);
  });

  test("responde 400 con UUID inválido", () => {
    const mw = requireUuidParam("id");
    const req = { params: { id: "no-uuid" } };
    const res = mkRes();
    let llamado = false;
    mw(req, res, () => {
      llamado = true;
    });
    assert.equal(llamado, false);
    assert.equal(res.statusCode, 400);
  });
});
