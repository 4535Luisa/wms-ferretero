const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  sendServerError,
  errorHandler,
  notFoundHandler,
} = require("../src/utils/errors");

const mkRes = () => ({
  statusCode: null,
  body: null,
  headersSent: false,
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});

describe("sendServerError", () => {
  test("responde 500 con mensaje genérico (no filtra el detalle real)", () => {
    const res = mkRes();
    const secreto = "duplicate key value violates unique constraint pk_x";
    sendServerError(res, new Error(secreto), {
      method: "POST",
      originalUrl: "/api/x",
    });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "Error procesando la solicitud");
    // El detalle interno NUNCA debe ir al cliente.
    assert.ok(!JSON.stringify(res.body).includes(secreto));
  });
});

describe("notFoundHandler", () => {
  test("responde 404 con JSON consistente", () => {
    const res = mkRes();
    notFoundHandler({ method: "GET", originalUrl: "/nope" }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "Recurso no encontrado");
  });
});

describe("errorHandler", () => {
  test("responde 500 genérico ante excepción no controlada", () => {
    const res = mkRes();
    errorHandler(
      new Error("boom"),
      { method: "GET", originalUrl: "/x" },
      res,
      () => {},
    );
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "Error interno del servidor");
  });
});
