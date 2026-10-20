const { test, describe } = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://x.supabase.co";
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || "dummy-key";

const supabase = require("../src/utils/supabase");
const { crearClienteAuth } = supabase;

// Regresión: signInWithPassword sobre el cliente compartido hacía que las
// consultas siguientes salieran con el JWT del usuario en vez de la service key.
describe("cliente Supabase compartido", () => {
  test("un login en el cliente aislado no cambia el token del compartido", async () => {
    const fetchOriginal = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          access_token: "jwt-de-usuario",
          refresh_token: "r",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "u1", email: "a@b.com", aud: "authenticated" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    try {
      const { error } = await crearClienteAuth().auth.signInWithPassword({
        email: "a@b.com",
        password: "x",
      });
      assert.equal(error, null);
      assert.equal(
        await supabase._getAccessToken(),
        process.env.SUPABASE_SERVICE_KEY,
      );
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});
