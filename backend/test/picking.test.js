const { test, describe } = require("node:test");
const assert = require("node:assert");
const { splitCajaSaldo, ORDEN_BODEGAS } = require("../src/utils/picking");

describe("splitCajaSaldo", () => {
  test("no aplica si la unidad de empaque es <= 1 o falsy", () => {
    assert.deepEqual(splitCajaSaldo(10, 0), {
      aplica: false,
      cajasCompletas: 0,
      unidadesSueltas: 0,
    });
    assert.deepEqual(splitCajaSaldo(10, 1), {
      aplica: false,
      cajasCompletas: 0,
      unidadesSueltas: 0,
    });
    assert.equal(splitCajaSaldo(10, undefined).aplica, false);
  });

  test("separa cajas completas y unidades sueltas", () => {
    assert.deepEqual(splitCajaSaldo(25, 12), {
      aplica: true,
      cajasCompletas: 2,
      unidadesSueltas: 1,
    });
  });

  test("cantidad exacta no deja sueltas", () => {
    assert.deepEqual(splitCajaSaldo(24, 12), {
      aplica: true,
      cajasCompletas: 2,
      unidadesSueltas: 0,
    });
  });

  test("cantidad menor a una caja es todo saldo", () => {
    assert.deepEqual(splitCajaSaldo(5, 12), {
      aplica: true,
      cajasCompletas: 0,
      unidadesSueltas: 5,
    });
  });
});

describe("ORDEN_BODEGAS", () => {
  test("mantiene el orden de barrido B8 -> B36 -> B7", () => {
    assert.deepEqual(ORDEN_BODEGAS, ["B8", "B36", "B7"]);
  });
});
