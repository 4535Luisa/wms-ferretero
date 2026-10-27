// Pruebas de integración contra la base REAL, solo lectura (ver arnes.js).
// Correr con: pnpm test:integracion   (necesita backend/.env con la clave)
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { correrMatriz, pedir } = require("./matriz");
const { preparar, ROLES, supabase } = require("./arnes");

const ESPERADOS = path.join(__dirname, "permisos.esperados.json");

// Permitido = el rol pasa los chequeos (no 401/403).
const permitido = (estado) => estado !== 401 && estado !== 403;

let matriz;
before(async () => {
  matriz = await correrMatriz();
});

describe("Seguridad: autenticación", () => {
  test("ninguna ruta (salvo login) responde sin sesión", () => {
    const abiertas = matriz.resultados.filter((f) => f.sinSesion !== 401);
    assert.deepEqual(abiertas.map((f) => `${f.metodo} ${f.ruta} -> ${f.sinSesion}`), []);
  });
});

describe("Integración: consultas contra la base real", () => {
  test("ningún GET permitido responde 500", () => {
    const fallas = matriz.resultados
      .filter((f) => f.error500)
      .map((f) => `${f.metodo} ${f.ruta}: ${f.error500[0]}`);
    assert.deepEqual(fallas, []);
  });

  test("las rutas que escriben nunca se ejecutaron (arnés desarmado)", () => {
    for (const f of matriz.resultados.filter((x) => x.escribe))
      for (const rol of ROLES) {
        const e = f.porRol[rol].estado;
        assert.ok([299, 401, 403].includes(e), `${f.metodo} ${f.ruta} (${rol}) respondió ${e}`);
      }
  });
});

describe("Seguridad: permisos por rol", () => {
  test("los permisos coinciden con los revisados (permisos.esperados.json)", () => {
    const actual = {};
    for (const f of matriz.resultados)
      actual[`${f.metodo} ${f.ruta}`] = ROLES.filter((r) => permitido(f.porRol[r].estado));
    if (!fs.existsSync(ESPERADOS) || process.env.ACTUALIZAR_PERMISOS === "1") {
      fs.writeFileSync(ESPERADOS, JSON.stringify(actual, null, 2) + "\n");
      return;
    }
    const esperados = JSON.parse(fs.readFileSync(ESPERADOS, "utf8"));
    assert.deepEqual(actual, esperados);
  });

  test("los roles de bodega no pueden administrar usuarios, pedidos ni verificación", () => {
    const bodega = ["operario", "montacarguista", "saldos"];
    const sensibles = matriz.resultados.filter(
      (f) =>
        f.escribe &&
        (f.ruta.startsWith("/api/usuarios") ||
          f.ruta.startsWith("/api/verificacion") ||
          /\/api\/pedidos\/(csv|tanda|:id\/(asignar|reasignar|cancelar|reabrir|prioridad|facturar))/.test(f.ruta)),
    );
    assert.ok(sensibles.length > 10);
    for (const f of sensibles)
      for (const rol of bodega)
        assert.equal(permitido(f.porRol[rol].estado), false, `${rol} puede ${f.metodo} ${f.ruta}`);
  });
});

describe("Seguridad: detalle de pedido", () => {
  let servidor;
  let puerto;
  let usuarios;
  before(async () => {
    const { app, usuariosPorRol } = await preparar();
    usuarios = usuariosPorRol;
    servidor = app.listen(0);
    puerto = servidor.address().port;
  });
  after(() => {
    servidor?.closeAllConnections();
    servidor?.close();
  });

  test("un operario no puede ver un pedido que no es suyo", async () => {
    const op = usuarios.operario;
    const { data } = await supabase
      .from("pedidos")
      .select("id")
      .or(`operario_id.is.null,operario_id.neq.${op.id}`)
      .limit(1);
    if (!data?.length) return;
    const r = await pedir(puerto, "GET", `/api/pedidos/${data[0].id}`, "operario");
    assert.equal(r.estado, 403);
  });

  test("pedido inexistente responde 404 y un id inválido 400", async () => {
    const r = await pedir(puerto, "GET", "/api/pedidos/11111111-1111-1111-1111-111111111111", "administrador");
    assert.equal(r.estado, 404);
    const r2 = await pedir(puerto, "GET", "/api/pedidos/no-es-uuid", "administrador");
    assert.equal(r2.estado, 400);
  });
});
