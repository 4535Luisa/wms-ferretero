const { test, describe } = require("node:test");
const assert = require("node:assert");
const { validarEnv } = require("../src/utils/env");

describe("validarEnv", () => {
  test("lanza si faltan variables requeridas", () => {
    const prev = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY,
    };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    assert.throws(() => validarEnv(), /Faltan variables de entorno/);
    if (prev.url !== undefined) process.env.SUPABASE_URL = prev.url;
    if (prev.key !== undefined) process.env.SUPABASE_SERVICE_KEY = prev.key;
  });

  test("no lanza con las variables presentes", () => {
    const prev = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY,
    };
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "service-key";
    assert.doesNotThrow(() => validarEnv());
    if (prev.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = prev.key;
  });
});
