// Service worker de MACHO WMS (app instalable).
//
// No guarda copias de la app ni de los datos: todo se pide siempre a la red,
// así cada publicación se ve de inmediato y nunca se trabaja con inventario
// viejo. Solo si no hay conexión al abrir una pantalla muestra un aviso en
// lugar de la página de error del navegador.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión · MACHO WMS</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A0A0A;color:#fff;font-family:Arial,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:28px;font-weight:700;letter-spacing:.06em">MACHO WMS</div>
<p style="color:#00FF87;font-weight:700;margin:16px 0 8px">Sin conexión</p>
<p style="color:#C9CDD4;margin:0 0 20px">Revisa el wifi o los datos del dispositivo.</p>
<button onclick="location.reload()" style="font:inherit;font-weight:700;padding:12px 24px;border:0;border-radius:8px;background:#00FF87;color:#0A0A0A">Reintentar</button></div>
</body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // lo demás va directo a la red
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(SIN_CONEXION, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
