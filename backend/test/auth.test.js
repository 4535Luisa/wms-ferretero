const { test, describe } = require("node:test");
const assert = require("node:assert");

// El módulo crea el cliente Supabase al cargarse; con valores dummy no falla
// (no hay red hasta usarlo). requireRoles y la rama sin-token no tocan Supabase.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://x.supabase.co";
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || "dummy-key";

const authMiddleware = require("../src/middlewares/auth.middleware");
const { requireRoles } = authMiddleware;

const mkRes = () => ({
  statusCode: null,
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

describe("requireRoles", () => {
  test("401 si no hay usuario autenticado", () => {
    const res = mkRes();
    let next = false;
    requireRoles("operario")({}, res, () => {
      next = true;
    });
    assert.equal(next, false);
    assert.equal(res.statusCode, 401);
  });

  test("el administrador siempre pasa (superusuario)", () => {
    const res = mkRes();
    let next = false;
    requireRoles("operario")({ usuario: { rol: "administrador" } }, res, () => {
      next = true;
    });
    assert.equal(next, true);
    assert.equal(res.statusCode, null);
  });

  test("pasa si el rol está en la lista permitida", () => {
    const res = mkRes();
    let next = false;
    requireRoles("jefe_bodega", "operario")(
      { usuario: { rol: "operario" } },
      res,
      () => {
        next = true;
      },
    );
    assert.equal(next, true);
  });

  test("403 si el rol no está permitido", () => {
    const res = mkRes();
    let next = false;
    requireRoles("administrador")({ usuario: { rol: "operario" } }, res, () => {
      next = true;
    });
    assert.equal(next, false);
    assert.equal(res.statusCode, 403);
  });
});

describe("authMiddleware", () => {
  test("401 si no se envía token", async () => {
    const res = mkRes();
    let next = false;
    await authMiddleware({ headers: {} }, res, () => {
      next = true;
    });
    assert.equal(next, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "Token requerido");
  });
});
