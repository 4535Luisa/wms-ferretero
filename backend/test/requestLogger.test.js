const { test, describe } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const requestLogger = require("../src/middlewares/requestLogger");

// Captura lo que el logger escribe a console durante fn().
function capturarConsola(fn) {
  const lineas = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (l) => lineas.push(l);
  console.warn = (l) => lineas.push(l);
  console.error = (l) => lineas.push(l);
  try {
    fn();
  } finally {
    Object.assign(console, orig);
  }
  return lineas;
}

const mkReqRes = (method, url, status) => {
  const req = { method, originalUrl: url, path: url.split("?")[0] };
  const res = new EventEmitter();
  res.statusCode = status;
  return { req, res };
};

describe("requestLogger", () => {
  test("llama next() y loguea al finalizar la respuesta", () => {
    const { req, res } = mkReqRes("GET", "/api/pedidos", 200);
    let next = false;
    const lineas = capturarConsola(() => {
      requestLogger(req, res, () => {
        next = true;
      });
      res.emit("finish");
    });
    assert.equal(next, true);
    assert.equal(lineas.length, 1);
    const log = JSON.parse(lineas[0]);
    assert.equal(log.level, "info");
    assert.equal(log.message, "request");
    assert.equal(log.meta.method, "GET");
    assert.equal(log.meta.path, "/api/pedidos");
    assert.equal(log.meta.status, 200);
    assert.equal(typeof log.meta.ms, "number");
  });

  test("usa nivel warn para 4xx y error para 5xx", () => {
    const c1 = capturarConsola(() => {
      const { req, res } = mkReqRes("POST", "/api/x", 404);
      requestLogger(req, res, () => {});
      res.emit("finish");
    });
    assert.equal(JSON.parse(c1[0]).level, "warn");

    const c2 = capturarConsola(() => {
      const { req, res } = mkReqRes("POST", "/api/x", 500);
      requestLogger(req, res, () => {});
      res.emit("finish");
    });
    assert.equal(JSON.parse(c2[0]).level, "error");
  });

  test("omite /health", () => {
    const lineas = capturarConsola(() => {
      const { req, res } = mkReqRes("GET", "/health", 200);
      requestLogger(req, res, () => {});
      res.emit("finish");
    });
    assert.equal(lineas.length, 0);
  });
});
