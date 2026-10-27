// Prueba de estrés LOCAL de la app real, sin tocar la base de datos: solo
// rutas que responden antes de consultar Supabase (/health, 401 sin sesión,
// cuerpos rechazados). Correr con: node test-integracion/estres.js
require("dotenv").config({ quiet: true });
process.env.LOG_LEVEL = "error";
const http = require("http");
const app = require("../src/app");

const agente = new http.Agent({ keepAlive: true, maxSockets: 200 });

function pedir(puerto, { metodo = "GET", ruta, cuerpo }) {
  return new Promise((resolve) => {
    const inicio = process.hrtime.bigint();
    const req = http.request(
      { host: "127.0.0.1", port: puerto, method: metodo, path: ruta, agent: agente, headers: cuerpo ? { "content-type": "application/json" } : {} },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ estado: res.statusCode, ms: Number(process.hrtime.bigint() - inicio) / 1e6 }));
      },
    );
    req.on("error", () => resolve({ estado: 0, ms: 0 }));
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

async function carga(puerto, nombre, total, concurrencia, opciones) {
  const tiempos = [];
  const estados = {};
  let siguiente = 0;
  const inicio = Date.now();
  const trabajador = async () => {
    while (siguiente < total) {
      siguiente++;
      const r = await pedir(puerto, opciones);
      tiempos.push(r.ms);
      estados[r.estado] = (estados[r.estado] || 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  const seg = (Date.now() - inicio) / 1000;
  tiempos.sort((a, b) => a - b);
  const p = (q) => tiempos[Math.min(tiempos.length - 1, Math.floor(q * tiempos.length))].toFixed(1);
  const fila = { prueba: nombre, peticiones: total, concurrencia, seg: seg.toFixed(2), por_seg: Math.round(total / seg), p50_ms: p(0.5), p95_ms: p(0.95), p99_ms: p(0.99), estados };
  console.log(JSON.stringify(fila));
  return fila;
}

(async () => {
  const servidor = app.listen(0, "127.0.0.1");
  await new Promise((r) => servidor.once("listening", r));
  const puerto = servidor.address().port;
  const memAntes = process.memoryUsage().rss;
  const r = [];
  r.push(await carga(puerto, "GET /health", 5000, 100, { ruta: "/health" }));
  r.push(await carga(puerto, "GET /api/pedidos sin sesión", 1500, 50, { ruta: "/api/pedidos" }));
  r.push(await carga(puerto, "POST login JSON roto", 150, 20, { metodo: "POST", ruta: "/api/auth/login", cuerpo: "{roto" }));
  const grande = JSON.stringify({ x: "a".repeat(1_100_000) });
  r.push(await carga(puerto, "POST cuerpo de 1,1 MB", 50, 10, { metodo: "POST", ruta: "/api/pedidos/csv", cuerpo: grande }));
  console.log(JSON.stringify({ memoria_mb_antes: Math.round(memAntes / 1e6), memoria_mb_despues: Math.round(process.memoryUsage().rss / 1e6) }));
  servidor.close();
  agente.destroy();
  if (process.argv[2]) require("fs").writeFileSync(process.argv[2], JSON.stringify(r, null, 2));
  process.exit(0);
})();
