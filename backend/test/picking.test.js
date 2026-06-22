const { test, describe } = require("node:test");
const assert = require("node:assert");
const { splitCajaSaldo, ORDEN_BODEGAS } = require("../src/utils/picking");

describe("splitCajaSaldo", () => {
  test("empaque desconocido (NULL/0/undefined) manda TODO a saldos, no omite", () => {
    // Regresión del bug: antes esto descartaba el producto del picking.
    assert.deepEqual(splitCajaSaldo(10, 0), {
      formaCaja: false,
      cajasCompletas: 0,
      unidadesSueltas: 10,
    });
    assert.deepEqual(splitCajaSaldo(10, null), {
      formaCaja: false,
      cajasCompletas: 0,
      unidadesSueltas: 10,
    });
    assert.deepEqual(splitCajaSaldo(10, undefined), {
      formaCaja: false,
      cajasCompletas: 0,
      unidadesSueltas: 10,
    });
  });

  test("empaque <= 1 no forma caja real: todo a saldos", () => {
    assert.deepEqual(splitCajaSaldo(10, 1), {
      formaCaja: false,
      cajasCompletas: 0,
      unidadesSueltas: 10,
    });
  });

  test("separa cajas completas y unidades sueltas", () => {
    assert.deepEqual(splitCajaSaldo(25, 12), {
      formaCaja: true,
      cajasCompletas: 2,
      unidadesSueltas: 1,
    });
  });

  test("cantidad exacta no deja sueltas", () => {
    assert.deepEqual(splitCajaSaldo(24, 12), {
      formaCaja: true,
      cajasCompletas: 2,
      unidadesSueltas: 0,
    });
  });

  test("cantidad menor a una caja es todo saldo", () => {
    assert.deepEqual(splitCajaSaldo(5, 12), {
      formaCaja: true,
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
