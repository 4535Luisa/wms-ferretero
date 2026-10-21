const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Supabase simulado (mismo esquema que pedidos.test.js): cada consulta registra
// sus operaciones y se resuelve con lo que devuelva `responder(tabla, ops)`;
// las RPC con `responderRpc(nombre, params)`.
let llamadas = [];
let rpcs = [];
let responder = () => ({ data: null, error: null });
let responderRpc = () => ({ data: {}, error: null });

const crearConsulta = (tabla) => {
  const ops = [];
  const consulta = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") {
          const resultado = Promise.resolve(responder(tabla, ops));
          llamadas.push({ tabla, ops });
          return resultado.then.bind(resultado);
        }
        return (...args) => {
          ops.push([prop, ...args]);
          return consulta;
        };
      },
    },
  );
  return consulta;
};

const fakeSupabase = {
  from: (tabla) => crearConsulta(tabla),
  rpc: async (nombre, params) => {
    rpcs.push({ nombre, params });
    return responderRpc(nombre, params);
  },
};

const rutaSupabase = path.resolve(__dirname, "../src/utils/supabase.js");
require.cache[rutaSupabase] = {
  id: rutaSupabase,
  filename: rutaSupabase,
  loaded: true,
  exports: fakeSupabase,
};

const panel = require("../src/controllers/panel.controller");
const { generarListasPicking } = require("../src/controllers/picking.controller");
const { semaforo, generarFocos, duracion } = require("../src/utils/panel");

const mkRes = () => ({
  statusCode: 200,
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

const mkReq = (extra = {}) => ({
  method: "GET",
  originalUrl: "/api/panel",
  query: {},
  body: {},
  usuario: { id: "admin-1", rol: "administrador" },
  ...extra,
});

beforeEach(() => {
  llamadas = [];
  rpcs = [];
  responder = () => ({ data: null, error: null });
  responderRpc = () => ({ data: {}, error: null });
});

describe("semaforo", () => {
  test("metas de mínimo (≥)", () => {
    assert.equal(semaforo(8, 8, "mayor"), "ok");
    assert.equal(semaforo(6.9, 8, "mayor"), "cerca");
    assert.equal(semaforo(6.2, 8, "mayor"), "bajo");
  });
  test("metas de máximo (≤)", () => {
    assert.equal(semaforo(1.4, 2, "menor"), "ok");
    assert.equal(semaforo(52, 50, "menor"), "cerca");
    assert.equal(semaforo(2.1, 1.5, "menor"), "bajo");
  });
  test("sin dato no hay semáforo", () => {
    assert.equal(semaforo(null, 8, "mayor"), null);
    assert.equal(semaforo(undefined, 8, "menor"), null);
  });
});

describe("duracion", () => {
  test("formatea minutos", () => {
    assert.equal(duracion(35), "35 min");
    assert.equal(duracion(155), "2 h 35 min");
    assert.equal(duracion(120), "2 h");
  });
});

describe("generarFocos", () => {
  const metas = {
    pedidos_dia_operario: 8,
    tiempo_medio_pedido_min: 50,
    errores_escaneo_pct: 1.5,
    fuera_hora_limite_dia: 2,
    espera_verificacion_min: 90,
  };

  test("sin problemas no hay focos", () => {
    const focos = generarFocos({
      indicadores: {
        pedidos_dia_operario: 9,
        tiempo_medio_pedido_min: 40,
        errores_escaneo_pct: 1,
        fuera_hora_limite_dia: 1,
        espera_verificacion_min: 60,
      },
      metas,
      operarios: [{ nombre: "A", pedidos: 45, dias: 5, escaneos: 0 }],
      faltantes: { top: [] },
      agotadas: 0,
    });
    assert.deepEqual(focos, []);
  });

  test("detecta cuello de botella, operarios bajo meta y mercancía", () => {
    const focos = generarFocos({
      indicadores: { espera_verificacion_min: 155, errores_escaneo_pct: 1 },
      metas,
      operarios: [
        { nombre: "Operario D", pedidos: 27, dias: 5, escaneos: 100, errores: 4 },
        { nombre: "Operario F", pedidos: 31, dias: 5, escaneos: 100, errores: 3 },
        { nombre: "Operario A", pedidos: 47, dias: 5, escaneos: 100, errores: 1 },
      ],
      faltantes: { top: [{ referencia: "REF-3001", veces: 3, cajas: 12 }] },
      agotadas: 3,
    });
    assert.deepEqual(
      focos.map((f) => f.tipo),
      ["flujo", "operarios", "mercancia", "mercancia"],
    );
    assert.match(focos[0].detalle, /2 h 35 min/);
    assert.match(focos[0].detalle, /1 h 5 min más/);
    assert.equal(focos[1].titulo, "Operario D y Operario F bajo la meta");
    assert.match(focos[1].detalle, /5,4 y 6,2 pedidos\/día/);
    assert.match(focos[2].titulo, /REF-3001/);
    assert.match(focos[3].titulo, /^3 referencias agotadas/);
  });

  test("no pasa de 5 focos", () => {
    const focos = generarFocos({
      indicadores: {
        tiempo_medio_pedido_min: 90,
        errores_escaneo_pct: 5,
        fuera_hora_limite_dia: 6,
        espera_verificacion_min: 300,
      },
      metas,
      operarios: [{ nombre: "X", pedidos: 1, dias: 1, escaneos: 0 }],
      faltantes: { top: [{ referencia: "R", veces: 2, cajas: 2 }] },
      agotadas: 1,
    });
    assert.equal(focos.length, 5);
  });
});

describe("panel.controller", () => {
  test("en vivo llama a la RPC con el rango de hoy y el de ayer", async () => {
    responderRpc = () => ({ data: { abiertos: 3 }, error: null });
    responder = () => ({
      data: [{ clave: "pedidos_dia_operario", valor: "7.5", updated_at: "x" }],
      error: null,
    });
    const res = mkRes();
    await panel.enVivo(mkReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(rpcs[0].nombre, "panel_en_vivo");
    const p = rpcs[0].params;
    assert.ok(p.p_desde < p.p_hasta);
    assert.ok(p.p_prev_desde < p.p_prev_hasta);
    assert.ok(p.p_prev_hasta <= p.p_desde);
    assert.equal(p.p_tz, "America/Bogota");
    assert.equal(res.body.metas.pedidos_dia_operario, 7.5);
    assert.equal(res.body.metas.errores_escaneo_pct, 1.5); // por defecto
    assert.deepEqual(res.body.datos, { abiertos: 3 });
  });

  test("periodo inválido → 400 sin consultar", async () => {
    const res = mkRes();
    await panel.flujo(mkReq({ query: { periodo: "siempre" } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(rpcs.length, 0);
  });

  test("si falta el SQL del panel responde 503 con el archivo a aplicar", async () => {
    responderRpc = () => ({ data: null, error: { code: "PGRST202" } });
    const res = mkRes();
    await panel.flujo(mkReq(), res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /2026-10-20_panel_control\.sql/);
  });

  test("mercancía valida bodega y prioridad, y pasa los filtros", async () => {
    let res = mkRes();
    await panel.mercancia(mkReq({ query: { bodega: "B8" } }), res);
    assert.equal(res.statusCode, 400);

    res = mkRes();
    await panel.flujo(mkReq({ query: { prioridad: "alta" } }), res);
    assert.equal(res.statusCode, 400);

    const bodega = "00000000-0000-0000-0000-000000000801";
    res = mkRes();
    await panel.mercancia(
      mkReq({ query: { bodega, familia: " Tornillería ", periodo: "mes" } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(rpcs[0].params.p_bodega, bodega);
    assert.equal(rpcs[0].params.p_familia, "Tornillería");
  });

  test("guardar metas valida claves y valores", async () => {
    const intentar = async (metas) => {
      const res = mkRes();
      await panel.guardarMetas(mkReq({ body: { metas } }), res);
      return res;
    };
    assert.equal((await intentar(undefined)).statusCode, 400);
    assert.equal((await intentar({})).statusCode, 400);
    assert.equal((await intentar({ stock_minimo: 3 })).statusCode, 400);
    assert.equal((await intentar({ errores_escaneo_pct: -1 })).statusCode, 400);
    assert.equal((await intentar({ errores_escaneo_pct: "abc" })).statusCode, 400);
    assert.equal(llamadas.length, 0);

    const res = await intentar({ pedidos_dia_operario: "8,5", errores_escaneo_pct: 2 });
    assert.equal(res.statusCode, 200);
    const [op, filas, opciones] = llamadas[0].ops[0];
    assert.equal(op, "upsert");
    assert.equal(llamadas[0].tabla, "panel_metas");
    assert.deepEqual(
      filas.map((f) => [f.clave, f.valor, f.updated_by]),
      [
        ["pedidos_dia_operario", 8.5, "admin-1"],
        ["errores_escaneo_pct", 2, "admin-1"],
      ],
    );
    assert.deepEqual(opciones, { onConflict: "clave" });
  });

  test("metas: 9 semanas de indicadores y focos de la semana pasada", async () => {
    responderRpc = (nombre) => {
      if (nombre === "panel_indicadores")
        return { data: { espera_verificacion_min: 200 }, error: null };
      return { data: {}, error: null };
    };
    responder = () => ({ data: [], error: null });
    const res = mkRes();
    await panel.verMetas(mkReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(rpcs.filter((r) => r.nombre === "panel_indicadores").length, 9);
    const espera = res.body.metas.find((m) => m.clave === "espera_verificacion_min");
    assert.equal(espera.estado, "bajo");
    assert.equal(espera.historial.length, 8);
    assert.equal(res.body.focos[0].tipo, "flujo");
  });

  test("actividad pagina de 1.000 en 1.000", async () => {
    let pagina = 0;
    responder = (tabla) => {
      assert.equal(tabla, "bitacora");
      pagina++;
      const n = pagina === 1 ? 1000 : 3;
      return {
        data: Array.from({ length: n }, () => ({
          accion: "CIERRE_PEDIDO",
          created_at: "2026-10-20T15:00:00Z",
          valores_despues: { pedido_numero: "P1" },
          usuarios: { nombre: "Op A", rol: "operario" },
        })),
        error: null,
      };
    };
    const res = mkRes();
    await panel.actividad(mkReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.filas.length, 1003);
    assert.equal(res.body.truncado, false);
    assert.deepEqual(llamadas[1].ops.find(([op]) => op === "range"), ["range", 1000, 1999]);
    assert.equal(res.body.filas[0].pedido, "P1");
  });
});

describe("generar listas registra los faltantes de stock", () => {
  test("una referencia sin stock en picking queda en la bitácora", async () => {
    responder = (tabla) => {
      if (tabla === "lista_picking_items") return { data: [], error: null };
      if (tabla === "bodegas")
        return {
          data: [
            { id: "b8", codigo: "B8" },
            { id: "b36", codigo: "B36" },
            { id: "b7", codigo: "B7" },
          ],
          error: null,
        };
      if (tabla === "ubicaciones") return { data: [], error: null };
      if (tabla === "pedidos")
        return {
          data: [
            {
              id: "p1",
              numero: "N1",
              pedido_items: [
                {
                  producto_id: "prod-1",
                  cantidad_pedida: 24,
                  productos: { codigo_interno: "R1", unidad_empaque: 12 },
                },
              ],
            },
          ],
          error: null,
        };
      if (tabla === "inventario") return { data: [], error: null };
      return { data: null, error: null };
    };
    const res = mkRes();
    await generarListasPicking(
      mkReq({ method: "POST", body: { pedido_ids: ["p1"] } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.advertencias.length, 1);
    const ins = llamadas.find(
      (l) => l.tabla === "bitacora" && l.ops[0][0] === "insert",
    );
    assert.ok(ins, "debe insertar en bitácora");
    const [fila] = ins.ops[0][1];
    assert.equal(fila.accion, "FALTANTE_STOCK_PICKING");
    assert.equal(fila.registro_id, "p1");
    assert.equal(fila.usuario_id, "admin-1");
    assert.deepEqual(fila.valores_despues, {
      pedido_numero: "N1",
      producto_id: "prod-1",
      referencia: "R1",
      cajas_requeridas: 2,
      cajas_reservadas: 0,
      cajas_faltantes: 2,
    });
  });
});
