const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { construirCorsOptions } = require("../src/utils/cors");

// Evalúa el callback de origin de las opciones CORS de forma síncrona.
const permite = (opts, origin) => {
  let resultado = null;
  opts.origin(origin, (_e, ok) => {
    resultado = ok;
  });
  return resultado;
};

describe("construirCorsOptions", () => {
  let prev;
  beforeEach(() => {
    prev = {
      origins: process.env.CORS_ORIGINS,
      site: process.env.NETLIFY_SITE,
    };
    delete process.env.CORS_ORIGINS;
    delete process.env.NETLIFY_SITE;
  });
  afterEach(() => {
    if (prev.origins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prev.origins;
    if (prev.site === undefined) delete process.env.NETLIFY_SITE;
    else process.env.NETLIFY_SITE = prev.site;
  });

  test("modo permisivo: permite localhost, onrender y cualquier netlify", () => {
    const o = construirCorsOptions();
    assert.equal(permite(o, "http://localhost:5173"), true);
    assert.equal(permite(o, "https://wms-macho-backend.onrender.com"), true);
    assert.equal(permite(o, "https://cualquiera.netlify.app"), true);
  });

  test("modo permisivo: deniega orígenes desconocidos y permite sin Origin", () => {
    const o = construirCorsOptions();
    assert.equal(permite(o, "https://evil.com"), false);
    assert.equal(permite(o, undefined), true);
  });

  test("NETLIFY_SITE restringe a ese sitio + previews y deniega otros netlify", () => {
    process.env.NETLIFY_SITE = "wms-macho";
    const o = construirCorsOptions();
    assert.equal(permite(o, "https://wms-macho.netlify.app"), true);
    assert.equal(
      permite(o, "https://deploy-preview-12--wms-macho.netlify.app"),
      true,
    );
    assert.equal(permite(o, "https://evil.netlify.app"), false);
    assert.equal(permite(o, "https://otro.netlify.app"), false);
  });

  test("CORS_ORIGINS agrega orígenes exactos", () => {
    process.env.CORS_ORIGINS = "https://mi-dominio.com,https://app.mi.com";
    const o = construirCorsOptions();
    assert.equal(permite(o, "https://mi-dominio.com"), true);
    assert.equal(permite(o, "https://app.mi.com"), true);
    assert.equal(permite(o, "https://no-listado.com"), false);
  });
});
