// Recorre todas las rutas con cada rol (y sin sesión) y devuelve la matriz de
// códigos HTTP. Solo lectura: las rutas que escriben están desarmadas (299).
const http = require("http");
const { preparar, rellenar, ROLES, supabase } = require("./arnes");

async function idsDeEjemplo() {
  const uno = async (tabla, filtro) => {
    let q = supabase.from(tabla).select("id").limit(1);
    if (filtro) q = filtro(q);
    const { data } = await q;
    return data?.[0]?.id;
  };
  const pedido = await uno("pedidos");
  const verif = await uno("pedidos", (q) => q.eq("estado", "cerrado"));
  return {
    id: pedido,
    producto: await uno("productos"),
    recepcion: await uno("recepciones"),
    verificacion: verif || pedido,
  };
}

function pedir(puerto, metodo, ruta, rol) {
  return new Promise((resolve) => {
    const inicio = process.hrtime.bigint();
    const req = http.request(
      { host: "127.0.0.1", port: puerto, method: metodo, path: ruta, headers: { "content-type": "application/json", ...(rol ? { "x-prueba-rol": rol } : {}) } },
      (res) => {
        let cuerpo = "";
        res.on("data", (c) => (cuerpo += c));
        res.on("end", () =>
          resolve({ estado: res.statusCode, ms: Number(process.hrtime.bigint() - inicio) / 1e6, cuerpo }),
        );
      },
    );
    req.on("error", (e) => resolve({ estado: 0, ms: 0, cuerpo: e.message }));
    if (metodo !== "GET") req.write("{}");
    req.end();
  });
}

async function correrMatriz() {
  const { app, rutas, usuariosPorRol } = await preparar();
  const ids = await idsDeEjemplo();
  const servidor = app.listen(0);
  const puerto = servidor.address().port;
  const resultados = [];
  for (const r of rutas) {
    if (r.ruta === "/api/auth/login") continue; // pública, sin rol
    const url = (base) => {
      const conIds = r.ruta.includes("/api/productos/:id")
        ? rellenar(base, { id: ids.producto })
        : r.ruta.includes("/api/recepciones/:id")
          ? rellenar(base, { id: ids.recepcion })
          : r.ruta.includes("/api/verificacion/:id")
            ? rellenar(base, { id: ids.verificacion })
            : rellenar(base, { id: ids.id });
      return conIds.replace(/\/$/, "") || "/";
    };
    const fila = { metodo: r.metodo, ruta: r.ruta, escribe: r.escribe, conRol: r.conRol, porRol: {} };
    fila.sinSesion = (await pedir(puerto, r.metodo, url(r.ruta), null)).estado;
    for (const rol of ROLES) {
      const res = await pedir(puerto, r.metodo, url(r.ruta), rol);
      fila.porRol[rol] = { estado: res.estado, ms: Math.round(res.ms) };
      if (res.estado >= 500) fila.error500 = (fila.error500 || []).concat(`${rol}: ${res.cuerpo.slice(0, 160)}`);
    }
    resultados.push(fila);
  }
  servidor.closeAllConnections();
  servidor.close();
  return { resultados, usuariosPorRol, ids };
}

module.exports = { correrMatriz, pedir };

if (require.main === module) {
  correrMatriz().then((m) => {
    const destino = process.argv[2];
    if (destino) require("fs").writeFileSync(destino, JSON.stringify(m, null, 2));
    for (const f of m.resultados) {
      const celdas = ROLES.map((r) => String(f.porRol[r].estado).padStart(4)).join("");
      console.log(`${f.metodo.padEnd(6)} ${f.ruta.padEnd(48)} anon:${f.sinSesion} |${celdas}${f.error500 ? "  <-- 500" : ""}`);
    }
    console.log("roles:", ROLES.join(" | "));
    process.exit(0);
  });
}
