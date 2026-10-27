const { test, describe } = require("node:test");
const assert = require("node:assert");
const { traerTodo, porLotes } = require("../src/utils/paginar");

// Consulta falsa: devuelve el tramo pedido con .range() de una tabla en memoria.
function tablaFalsa(total, { fallarEnDesde } = {}) {
  const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos = [];
  const construir = () => ({
    range(desde, hasta) {
      pedidos.push([desde, hasta]);
      if (fallarEnDesde === desde)
        return Promise.resolve({ data: null, error: { message: "falla" } });
      return Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null });
    },
  });
  return { construir, pedidos };
}

describe("traerTodo (paginación de Supabase)", () => {
  test("tabla vacía: una sola consulta y lista vacía", async () => {
    const t = tablaFalsa(0);
    const { data, error } = await traerTodo(t.construir, 10);
    assert.deepEqual(data, []);
    assert.equal(error, null);
    assert.equal(t.pedidos.length, 1);
  });

  test("menos de una página: una sola consulta", async () => {
    const t = tablaFalsa(7);
    const { data } = await traerTodo(t.construir, 10);
    assert.equal(data.length, 7);
    assert.equal(t.pedidos.length, 1);
  });

  test("más de 1000 filas: trae todas las páginas (caso real: 1235 productos)", async () => {
    const t = tablaFalsa(1235);
    const { data } = await traerTodo(t.construir);
    assert.equal(data.length, 1235);
    assert.deepEqual(t.pedidos, [
      [0, 999],
      [1000, 1999],
    ]);
    assert.equal(data[1234].id, 1234);
  });

  test("múltiplo exacto del tamaño: pide una página extra vacía y termina", async () => {
    const t = tablaFalsa(20);
    const { data } = await traerTodo(t.construir, 10);
    assert.equal(data.length, 20);
    assert.equal(t.pedidos.length, 3);
  });

  test("un error en cualquier página se devuelve sin datos parciales", async () => {
    const t = tablaFalsa(25, { fallarEnDesde: 10 });
    const { data, error } = await traerTodo(t.construir, 10);
    assert.equal(data, null);
    assert.equal(error.message, "falla");
  });
});

describe("porLotes (filtros .in() largos)", () => {
  test("parte los ids en lotes y une los resultados", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i);
    const lotes = [];
    const { data } = await porLotes(ids, async (lote) => {
      lotes.push(lote.length);
      return { data: lote.map((id) => ({ id })), error: null };
    });
    assert.deepEqual(lotes, [200, 200, 50]);
    assert.equal(data.length, 450);
  });

  test("sin ids no consulta nada", async () => {
    let llamadas = 0;
    const { data } = await porLotes([], async () => {
      llamadas++;
      return { data: [], error: null };
    });
    assert.deepEqual(data, []);
    assert.equal(llamadas, 0);
  });

  test("propaga el error de un lote", async () => {
    const { data, error } = await porLotes([1, 2, 3], async () => ({ data: null, error: { message: "x" } }), 2);
    assert.equal(data, null);
    assert.equal(error.message, "x");
  });
});
