const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Supabase simulado: cada consulta registra sus operaciones y se resuelve con
// lo que devuelva `responder(tabla, ops)`. Se inyecta en require.cache antes
// de cargar el controlador.
let llamadas = [];
let responder = () => ({ data: null, error: null });

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
  rpc: async () => ({ data: null, error: null }),
};

const rutaSupabase = path.resolve(__dirname, "../src/utils/supabase.js");
require.cache[rutaSupabase] = {
  id: rutaSupabase,
  filename: rutaSupabase,
  loaded: true,
  exports: fakeSupabase,
};

const {
  facturarPedido,
  actualizarItemOperario,
  cargarCSV,
  cerrarPedido,
} = require("../src/controllers/pedidos.controller");

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

beforeEach(() => {
  llamadas = [];
  responder = () => ({ data: null, error: null });
});

describe("facturarPedido", () => {
  const pedido = {
    id: "p1",
    numero: "N1",
    estado: "verificado",
    facturado: false,
    pedido_items: [
      { producto_id: "x", cantidad_pedida: 10, cantidad_picking: 10 },
    ],
  };

  test("no descuenta inventario (ya se descontó al bajar/entregar)", async () => {
    responder = (tabla, ops) => {
      if (tabla === "pedidos" && tiene(ops, "update"))
        return { data: [{ id: "p1" }], error: null };
      if (tabla === "pedidos" && tiene(ops, "single") && tiene(ops, "select")) {
        const porFactura = ops.some(
          ([op, col]) => op === "eq" && col === "numero_factura",
        );
        return { data: porFactura ? null : pedido, error: null };
      }
      return { data: null, error: null };
    };
    const res = mkRes();
    await facturarPedido(
      {
        params: { id: "p1" },
        body: { numero_factura: "F-1" },
        usuario: { id: "u1" },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(
      llamadas.some((l) => l.tabla === "inventario"),
      false,
    );
  });

  test("si el update condicionado no afecta filas, responde 'ya facturado'", async () => {
    responder = (tabla, ops) => {
      if (tabla === "pedidos" && tiene(ops, "update"))
        return { data: [], error: null };
      if (tabla === "pedidos" && tiene(ops, "single")) {
        const porFactura = ops.some(
          ([op, col]) => op === "eq" && col === "numero_factura",
        );
        return { data: porFactura ? null : pedido, error: null };
      }
      return { data: null, error: null };
    };
    const res = mkRes();
    await facturarPedido(
      {
        params: { id: "p1" },
        body: { numero_factura: "F-1" },
        usuario: { id: "u1" },
      },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /ya fue facturado/);
    assert.equal(
      llamadas.some((l) => l.tabla === "bitacora"),
      false,
    );
  });
});

describe("actualizarItemOperario", () => {
  const item = {
    id: "i1",
    producto_id: "x",
    referencia: "120363",
    cantidad_pedida: 24,
    cantidad_saldos: 0,
    unidades_escaneadas: 12,
    estado: "pendiente",
    pedidos: { operario_id: "op1", estado: "en_picking", numero: "N1" },
    productos: { codigo_interno: "120363", unidad_empaque: 12 },
  };
  const operario = { id: "op1", rol: "operario" };

  const responderItem = (updateData) => (tabla, ops) => {
    if (tabla === "pedido_items" && tiene(ops, "update"))
      return { data: updateData, error: null };
    if (tabla === "pedido_items") return { data: item, error: null };
    return { data: null, error: null };
  };

  test("operario: no puede marcar la cantidad completa en modo manual", async () => {
    responder = responderItem([{ ...item }]);
    const res = mkRes();
    await actualizarItemOperario(
      {
        params: { itemId: "i1" },
        body: { cantidad_picking: 24, estado: "completo" },
        usuario: operario,
      },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /escanea las cajas una por una/);
  });

  test("operario: puede reportar un faltante con motivo sin escanear", async () => {
    responder = responderItem({ ...item, cantidad_picking: 20 });
    const res = mkRes();
    await actualizarItemOperario(
      {
        params: { itemId: "i1" },
        body: {
          cantidad_picking: 20,
          motivo_diferencia: "caja rota",
          estado: "otro_estado",
        },
        usuario: operario,
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    const update = llamadas.find(
      (l) => l.tabla === "pedido_items" && tiene(l.ops, "update"),
    );
    const valores = update.ops.find(([op]) => op === "update")[1];
    assert.equal(valores.estado, "completo"); // el cliente no decide el estado
    assert.equal(valores.cantidad_picking, 20);
  });

  test("escaneo caja a caja: el update va condicionado al valor leído", async () => {
    responder = responderItem([{ ...item, unidades_escaneadas: 24 }]);
    const res = mkRes();
    await actualizarItemOperario(
      {
        params: { itemId: "i1" },
        body: { escaneo_caja: true, referencia_escaneada: "120363" },
        usuario: operario,
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    const update = llamadas.find(
      (l) => l.tabla === "pedido_items" && tiene(l.ops, "update"),
    );
    assert.ok(
      update.ops.some(
        ([op, col, val]) =>
          op === "eq" && col === "unidades_escaneadas" && val === 12,
      ),
    );
  });

  test("escaneo caja a caja: escaneo simultáneo (0 filas) responde 409", async () => {
    responder = responderItem([]);
    const res = mkRes();
    await actualizarItemOperario(
      {
        params: { itemId: "i1" },
        body: { escaneo_caja: true, referencia_escaneada: "120363" },
        usuario: operario,
      },
      res,
    );
    assert.equal(res.statusCode, 409);
  });

  test("escaneo caja a caja: referencia incorrecta responde 422", async () => {
    responder = responderItem([{ ...item }]);
    const res = mkRes();
    await actualizarItemOperario(
      {
        params: { itemId: "i1" },
        body: { escaneo_caja: true, referencia_escaneada: "999" },
        usuario: operario,
      },
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.resultado, "mismatch");
  });
});

describe("cargarCSV", () => {
  test("si fallan los ítems, borra el pedido y no expone el error interno", async () => {
    responder = (tabla, ops) => {
      if (tabla === "pedidos" && tiene(ops, "insert"))
        return { data: { id: "nuevo" }, error: null };
      if (tabla === "pedidos" && tiene(ops, "single"))
        return { data: null, error: null }; // no existe aún
      if (tabla === "pedido_items" && tiene(ops, "insert"))
        return {
          data: null,
          error: { code: "23503", message: "violates foreign key fk_x" },
        };
      return { data: null, error: null };
    };
    const res = mkRes();
    await cargarCSV(
      {
        method: "POST",
        originalUrl: "/api/pedidos/csv",
        body: {
          pedidos: [
            { numero: "N1", items: [{ producto_id: "x", cantidad_pedida: 1 }] },
          ],
        },
      },
      res,
    );
    assert.equal(res.body.importados, 0);
    assert.equal(res.body.errores.length, 1);
    assert.doesNotMatch(res.body.errores[0].error, /fk_x/);
    assert.ok(
      llamadas.some((l) => l.tabla === "pedidos" && tiene(l.ops, "delete")),
    );
  });

  test("un pedido sin items válido no tumba toda la carga", async () => {
    const res = mkRes();
    await cargarCSV(
      {
        method: "POST",
        originalUrl: "/api/pedidos/csv",
        body: { pedidos: [{ numero: "N1" }] },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.errores.length, 1);
  });
});

describe("cerrarPedido", () => {
  test("avisa 'listo para verificar' a los administradores y a facturación", async () => {
    responder = (tabla, ops) => {
      if (tabla === "pedidos" && tiene(ops, "single"))
        return {
          data: {
            id: "p1",
            numero: "N1",
            estado: "en_picking",
            operario_id: "op1",
            pedido_items: [{ id: "i1", estado: "completo" }],
          },
          error: null,
        };
      if (tabla === "usuarios")
        return {
          data: [
            { id: "a1", rol: "administrador" },
            { id: "f1", rol: "facturacion" },
          ],
          error: null,
        };
      return { data: null, error: null };
    };
    const res = mkRes();
    await cerrarPedido(
      { params: { id: "p1" }, usuario: { id: "op1", rol: "operario" } },
      res,
    );
    assert.equal(res.statusCode, 200);

    const consultaUsuarios = llamadas.find((l) => l.tabla === "usuarios");
    const roles = consultaUsuarios.ops.find(([op]) => op === "in")[2];
    assert.ok(roles.includes("administrador"));

    const avisos = llamadas
      .find((l) => l.tabla === "notificaciones")
      .ops.find(([op]) => op === "insert")[1];
    const admin = avisos.find((a) => a.usuario_id === "a1");
    const fact = avisos.find((a) => a.usuario_id === "f1");
    assert.equal(admin.titulo, "Pedido listo para verificar");
    assert.equal(fact.titulo, "Pedido listo para facturar");
  });
});
