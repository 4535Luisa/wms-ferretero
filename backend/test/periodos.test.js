const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  calcularPeriodo,
  ultimasSemanas,
  inicioDia,
  partesLocales,
} = require("../src/utils/periodos");

const TZ = "America/Bogota";
// Martes 20 oct 2026, 10:30 en Bogotá (UTC−5) = 15:30 UTC.
const AHORA = new Date("2026-10-20T15:30:00Z");
const iso = (d) => d.toISOString();

describe("periodos en hora de Bogotá", () => {
  test("inicioDia es la medianoche local", () => {
    assert.equal(iso(inicioDia(2026, 10, 20, TZ)), "2026-10-20T05:00:00.000Z");
    // Desbordes: día 0 = último día del mes anterior.
    assert.equal(iso(inicioDia(2026, 10, 0, TZ)), "2026-09-30T05:00:00.000Z");
    assert.equal(iso(inicioDia(2026, 13, 1, TZ)), "2027-01-01T05:00:00.000Z");
  });

  test("a las 23:30 locales sigue siendo el mismo día local", () => {
    const p = partesLocales(new Date("2026-10-21T04:30:00Z"), TZ);
    assert.deepEqual([p.y, p.m, p.d, p.h], [2026, 10, 20, 23]);
    assert.equal(p.diaSemana, 1); // martes
  });

  test("hoy se compara con ayer hasta la misma hora", () => {
    const r = calcularPeriodo({ periodo: "hoy" }, AHORA, TZ);
    assert.equal(iso(r.desde), "2026-10-20T05:00:00.000Z");
    assert.equal(iso(r.hasta), "2026-10-20T15:30:00.000Z");
    assert.equal(iso(r.prevDesde), "2026-10-19T05:00:00.000Z");
    assert.equal(iso(r.prevHasta), "2026-10-19T15:30:00.000Z");
  });

  test("semana empieza el lunes", () => {
    const r = calcularPeriodo({ periodo: "semana" }, AHORA, TZ);
    assert.equal(iso(r.desde), "2026-10-19T05:00:00.000Z");
    assert.equal(iso(r.prevDesde), "2026-10-12T05:00:00.000Z");
    assert.equal(iso(r.prevHasta), "2026-10-13T15:30:00.000Z");
  });

  test("mes: el anterior no pasa del inicio del actual", () => {
    // 31 de marzo: el mes anterior (febrero) es más corto.
    const ahora = new Date("2027-03-31T20:00:00Z");
    const r = calcularPeriodo({ periodo: "mes" }, ahora, TZ);
    assert.equal(iso(r.desde), "2027-03-01T05:00:00.000Z");
    assert.equal(iso(r.prevDesde), "2027-02-01T05:00:00.000Z");
    assert.equal(iso(r.prevHasta), "2027-03-01T05:00:00.000Z");
  });

  test("30d incluye hoy y el anterior son los 30 días previos", () => {
    const r = calcularPeriodo({ periodo: "30d" }, AHORA, TZ);
    assert.equal(iso(r.desde), "2026-09-21T05:00:00.000Z");
    assert.equal(iso(r.prevDesde), "2026-08-22T05:00:00.000Z");
    assert.equal(iso(r.prevHasta), iso(r.desde));
  });

  test("personalizado incluye el último día completo", () => {
    const r = calcularPeriodo(
      { periodo: "personalizado", desde: "2026-10-01", hasta: "2026-10-07" },
      AHORA,
      TZ,
    );
    assert.equal(iso(r.desde), "2026-10-01T05:00:00.000Z");
    assert.equal(iso(r.hasta), "2026-10-08T05:00:00.000Z");
    assert.equal(iso(r.prevDesde), "2026-09-24T05:00:00.000Z");
    assert.equal(iso(r.prevHasta), iso(r.desde));
  });

  test("rechaza periodos y fechas inválidos", () => {
    assert.ok(calcularPeriodo({ periodo: "x" }, AHORA, TZ).error);
    assert.ok(calcularPeriodo({}, AHORA, TZ).error);
    const mal = (desde, hasta) =>
      calcularPeriodo({ periodo: "personalizado", desde, hasta }, AHORA, TZ)
        .error;
    assert.ok(mal("2026-02-30", "2026-03-01"));
    assert.ok(mal("2026-10-07", "2026-10-01"));
    assert.ok(mal("2024-01-01", "2026-01-01"));
    assert.ok(mal("hoy", "2026-01-01"));
  });

  test("ultimasSemanas: de lunes a lunes, la última termina ahora", () => {
    const s = ultimasSemanas(3, AHORA, TZ);
    assert.deepEqual(
      s.map((x) => [iso(x.desde), iso(x.hasta)]),
      [
        ["2026-10-05T05:00:00.000Z", "2026-10-12T05:00:00.000Z"],
        ["2026-10-12T05:00:00.000Z", "2026-10-19T05:00:00.000Z"],
        ["2026-10-19T05:00:00.000Z", "2026-10-20T15:30:00.000Z"],
      ],
    );
  });

  test("funciona con zonas con horario de verano", () => {
    // Madrid pasa a horario de invierno el 25 oct 2026 (UTC+2 → UTC+1).
    assert.equal(
      iso(inicioDia(2026, 10, 25, "Europe/Madrid")),
      "2026-10-24T22:00:00.000Z",
    );
    assert.equal(
      iso(inicioDia(2026, 10, 26, "Europe/Madrid")),
      "2026-10-25T23:00:00.000Z",
    );
  });
});
