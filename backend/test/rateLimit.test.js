const { test, describe } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const express = require("express");

const { apiLimiter, claveSesion } = require("../src/middlewares/rateLimit");

// Envía n peticiones GET con el token dado y cuenta los códigos de respuesta.
async function rafaga(puerto, n, token) {
  const cuenta = {};
  for (let i = 0; i < n; i++) {
    const estado = await new Promise((resolve) => {
      http
        .get(
          { host: "127.0.0.1", port: puerto, path: "/api/x", headers: token ? { authorization: `Bearer ${token}` } : {} },
          (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
          },
        )
        .on("error", () => resolve(0));
    });
    cuenta[estado] = (cuenta[estado] || 0) + 1;
  }
  return cuenta;
}

describe("límite de peticiones por sesión", () => {
  test("la clave usa el token, no el texto del token ni la IP", () => {
    const a = claveSesion({ headers: { authorization: "Bearer abc" }, ip: "1.1.1.1" });
    const b = claveSesion({ headers: { authorization: "Bearer abc" }, ip: "2.2.2.2" });
    const c = claveSesion({ headers: { authorization: "Bearer xyz" }, ip: "1.1.1.1" });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.ok(!a.includes("abc"));
    assert.ok(claveSesion({ headers: {}, ip: "1.1.1.1" }).startsWith("ip:"));
  });

  test("12 usuarios en la misma IP no se bloquean entre sí; uno solo sí se limita", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use("/api", apiLimiter);
    app.get("/api/x", (req, res) => res.json({ ok: true }));
    const servidor = app.listen(0, "127.0.0.1");
    await new Promise((r) => servidor.once("listening", r));
    const puerto = servidor.address().port;
    try {
      // 12 sesiones × 100 = 1200 peticiones desde la misma IP: antes, con el
      // límite por IP (1000), las últimas 200 recibían 429.
      let total429 = 0;
      for (let u = 0; u < 12; u++) total429 += (await rafaga(puerto, 100, `usuario-${u}`))[429] || 0;
      assert.equal(total429, 0);

      // Una sola sesión que pasa de 1000 sí recibe 429.
      const abuso = await rafaga(puerto, 1010, "abusivo");
      assert.equal(abuso[200], 1000);
      assert.equal(abuso[429], 10);
    } finally {
      servidor.closeAllConnections();
      servidor.close();
    }
  });
});
