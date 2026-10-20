const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Supabase simulado (mismo enfoque que pedidos.test.js).
let llamadas = [];
let responder = () => ({ data: null, error: null });
let rpcResponder = () => ({ data: null, error: null });

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
    llamadas.push({ rpc: nombre, params });
    return rpcResponder(nombre, params);
  },
};

const rutaSupabase = path.resolve(__dirname, "../src/utils/supabase.js");
require.cache[rutaSupabase] = {
  id: rutaSupabase,
  filename: rutaSupabase,
  loaded: true,
  exports: fakeSupabase,
};

const {
  crearTraslado,
  confirmarTraslado,
  cancelarTraslado,
} = require("../src/controllers/traslados.controller");
const {
  registrarConteo,
  generarAjuste,
} = require("../src/controllers/conteos.controller");

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

const tiene = (ops, nombre) => ops.some(([op]) => op === nombre);
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  llamadas = [];
  responder = () => ({ data: null, error: null });
  rpcResponder = () => ({ data: null, error: null });
});

describe("traslados", () => {
  const req = (body) => ({
    method: "POST",
    originalUrl: "/api/traslados",
    body,
    usuario: { id: U3 },
  });

  test("crea el traslado vía RPC con los parámetros que espera el SQL", async () => {
    rpcResponder = () => ({
      data: { status: "ok", traslado_id: "t1" },
      error: null,
    });
    const res = mkRes();
    await crearTraslado(
      req({
        producto_id: U1,
        bodega_origen_id: U2,
        bodega_destino_id: U3,
        cantidad: 5,
      }),
      res,
    );
    assert.equal(res.statusCode, 200);
    const llamada = llamadas.find((l) => l.rpc === "crear_traslado");
    assert.deepEqual(llamada.params, {
      p_producto_id: U1,
      p_bodega_origen: U2,
      p_bodega_destino: U3,
      p_ubicacion_origen: null,
      p_cantidad: 5,
      p_motivo: null,
      p_usuario_id: U3,
    });
  });

  test("rechaza origen = destino sin llamar a la RPC", async () => {
    const res = mkRes();
    await crearTraslado(
      req({
        producto_id: U1,
        bodega_origen_id: U2,
        bodega_destino_id: U2,
        cantidad: 5,
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(
      llamadas.some((l) => l.rpc),
      false,
    );
  });

  test("stock insuficiente responde 400 con el disponible", async () => {
    rpcResponder = () => ({
      data: { status: "insufficient", disponible: 3 },
      error: null,
    });
    const res = mkRes();
    await crearTraslado(
      req({
        producto_id: U1,
        bodega_origen_id: U2,
        bodega_destino_id: U3,
        cantidad: 5,
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /disponible: 3/);
  });

  test("confirmar/cancelar un traslado ya cerrado responde 400", async () => {
    rpcResponder = () => ({ data: { status: "already_done" }, error: null });
    for (const fn of [confirmarTraslado, cancelarTraslado]) {
      const res = mkRes();
      await fn({ params: { id: U1 }, usuario: { id: U3 } }, res);
      assert.equal(res.statusCode, 400);
    }
  });
});

describe("conteos", () => {
  test("registrar sobre un mini-conteo ya resuelto responde 400", async () => {
    responder = (tabla, ops) => {
      if (tabla === "inventario")
        return { data: { cantidad_disponible: 10 }, error: null };
      if (tabla === "mini_conteos" && tiene(ops, "update"))
        return { data: [], error: null }; // ya no está pendiente
      return { data: null, error: null };
    };
    const res = mkRes();
    await registrarConteo(
      {
        body: {
          producto_id: U1,
          bodega_id: U2,
          cantidad_contada: 8,
          mini_conteo_id: U3,
        },
        usuario: { id: U3 },
      },
      res,
    );
    assert.equal(res.statusCode, 400);
    const update = llamadas.find(
      (l) => l.tabla === "mini_conteos" && tiene(l.ops, "update"),
    );
    assert.ok(
      update.ops.some(
        ([op, col, val]) => op === "eq" && col === "estado" && val === "pendiente",
      ),
    );
  });

  test("registrar un conteo nuevo calcula la diferencia contra el sistema", async () => {
    responder = (tabla, ops) => {
      if (tabla === "inventario")
        return { data: { cantidad_disponible: 10 }, error: null };
      if (tabla === "mini_conteos" && tiene(ops, "insert"))
        return { data: { id: "m1" }, error: null };
      return { data: null, error: null };
    };
    const res = mkRes();
    await registrarConteo(
      {
        body: { producto_id: U1, bodega_id: U2, cantidad_contada: 8 },
        usuario: { id: U3 },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.diferencia, -2);
  });

  const conteoConDiferencia = {
    id: U1,
    producto_id: U2,
    bodega_id: U3,
    estado: "contado",
    ajuste_id: null,
    diferencia: -2,
    cantidad_sistema: 10,
    cantidad_contada: 8,
  };

  test("generar ajuste dos veces a la vez: la segunda no crea otro ajuste", async () => {
    responder = (tabla, ops) => {
      if (tabla === "mini_conteos" && tiene(ops, "single"))
        return { data: conteoConDiferencia, error: null };
      if (tabla === "mini_conteos" && tiene(ops, "update"))
        return { data: [], error: null }; // otro request ya lo reclamó
      return { data: null, error: null };
    };
    const res = mkRes();
    await generarAjuste(
      { params: { id: U1 }, usuario: { id: U3 } },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(
      llamadas.some((l) => l.tabla === "ajustes_inventario"),
      false,
    );
  });

  test("generar ajuste: crea un decremento pendiente por la diferencia", async () => {
    responder = (tabla, ops) => {
      if (tabla === "mini_conteos" && tiene(ops, "single"))
        return { data: conteoConDiferencia, error: null };
      if (tabla === "mini_conteos" && tiene(ops, "update"))
        return { data: [{ id: U1 }], error: null };
      if (tabla === "ajustes_inventario")
        return { data: { id: "aj1" }, error: null };
      return { data: [], error: null };
    };
    const res = mkRes();
    await generarAjuste(
      { params: { id: U1 }, usuario: { id: U3 } },
      res,
    );
    assert.equal(res.statusCode, 200);
    const insert = llamadas
      .find((l) => l.tabla === "ajustes_inventario")
      .ops.find(([op]) => op === "insert")[1];
    assert.equal(insert.sentido, "decremento");
    assert.equal(insert.cantidad, 2);
    assert.equal(insert.estado, "pendiente");
  });
});
