const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  splitCajaSaldo,
  ORDEN_BODEGAS,
  expandirCajas,
} = require("../src/utils/picking");

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

describe("expandirCajas", () => {
  const linea = {
    pedido_id: "p1",
    producto_id: "prod1",
    ubicacion_id: "u1",
    ubicacion_codigo: "A-01",
    referencia: "120363",
    descripcion: "Tornillo",
    cantidad_cajas: 3,
    cantidad_unidades: 36,
    destino_saldos: false,
    wave_id: "W001",
  };

  test("una fila por caja, cada una con SOLO sus unidades", () => {
    // Regresión: cada caja copiaba el total de la línea (36) y bajar_caja
    // descontaba 3 x 36 = 108 en vez de 36.
    const filas = expandirCajas([linea], "lista1");
    assert.equal(filas.length, 3);
    for (const f of filas) {
      assert.equal(f.cantidad_cajas, 1);
      assert.equal(f.cantidad_unidades, 12);
      assert.equal(f.lista_id, "lista1");
      assert.equal(f.estado, "pendiente");
    }
    const total = filas.reduce((a, f) => a + f.cantidad_unidades, 0);
    assert.equal(total, 36);
  });

  test("no copia campos internos (inventario_id, pedido_numero)", () => {
    const [f] = expandirCajas(
      [{ ...linea, cantidad_cajas: 1, cantidad_unidades: 12, inventario_id: "i1", pedido_numero: "N1" }],
      "lista1",
    );
    assert.equal("inventario_id" in f, false);
    assert.equal("pedido_numero" in f, false);
  });
});
