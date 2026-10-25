/**
 * Smoke tests de segurança e roteamento sem usar token real ou rede.
 * Execute com Node.js 22+: node --test tests/loja-integrada-readonly.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const file = new URL("../supabase/functions/loja-integrada-readonly-v1/index.ts", import.meta.url);
const source = stripTypeScriptTypes(
  readFileSync(file, "utf8").replace(/^import\s+["']jsr:[^\n]+\n/m, ""),
  { mode: "strip" },
);

function bootstrap({ token = "fake-personal-token", apiStatus = 200, payload = { meta: { total_count: 8 }, objects: [] } } = {}) {
  let handler;
  const calls = [];
  const env = { SUPABASE_SERVICE_ROLE_KEY: "fake-service-jwt", LI_PERSONAL_TOKEN: token };
  const mockFetch = async (url, init) => {
    calls.push({ url: String(url), options: init });
    return new Response(JSON.stringify(payload), { status: apiStatus, headers: { "content-type": "application/json" } });
  };
  runInNewContext(source, {
    Deno: { env: { get: (key) => env[key] }, serve: (h) => { handler = h; } },
    fetch: mockFetch, URL, Request, Response, setTimeout, clearTimeout, AbortController, DOMException,
  });
  const req = (query = "action=status", method = "GET", auth = "Bearer fake-service-jwt") =>
    handler(new Request(`https://example.test/functions/v1/li?${query}`, { method, headers: auth ? { Authorization: auth } : {} }));
  return { req, calls, env };
}

test("recusa acesso anônimo sem acionar a Loja Integrada", async () => {
  const t = bootstrap();
  const res = await t.req("action=status", "GET", "");
  assert.equal(res.status, 403);
  assert.equal(t.calls.length, 0);
});

test("recusa token de usuário diferente do service role", async () => {
  const t = bootstrap();
  const res = await t.req("action=products", "GET", "Bearer user-jwt");
  assert.equal(res.status, 403);
  assert.equal(t.calls.length, 0);
});

test("somente GET é aceito", async () => {
  const t = bootstrap();
  const res = await t.req("action=products", "POST");
  assert.equal(res.status, 405);
  assert.equal(t.calls.length, 0);
});

test("sem segredo não tenta upstream", async () => {
  const t = bootstrap({ token: "" });
  const res = await t.req();
  assert.equal(res.status, 503);
  assert.equal(t.calls.length, 0);
});

test("status retorna apenas metadado; envia Basic e paginação mínima", async () => {
  const t = bootstrap();
  const res = await t.req();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).products, 8);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].options.headers.Authorization, "Basic fake-personal-token");
  assert.match(t.calls[0].url, /\/v1\/produto\?limit=1&offset=0/);
});

test("não permite URL arbitrária nem identificador inválido", async () => {
  const t = bootstrap();
  assert.equal((await t.req("action=unknown")).status, 400);
  assert.equal((await t.req("action=stock&id=../../pedido")).status, 400);
  assert.equal(t.calls.length, 0);
});

test("consultas preço e estoque usam endpoint fixo individual", async () => {
  const t = bootstrap();
  await t.req("action=stock&id=123");
  await t.req("action=price&id=123");
  assert.equal(new URL(t.calls[0].url).pathname, "/v1/produto_estoque/123");
  assert.equal(new URL(t.calls[1].url).pathname, "/v1/produto_preco/123");
});

test("limita lista de categorias e não repassa erros internos", async () => {
  const t = bootstrap({ apiStatus: 401, payload: { message: "secret-server-debug-data" } });
  const res = await t.req("action=categories&limit=9999");
  assert.equal(res.status, 502);
  const body = JSON.stringify(await res.json());
  assert.equal(body.includes("secret-server-debug-data"), false);
  assert.match(t.calls[0].url, /limit=10/);
});

test("SKU inválido é rejeitado sem requisição à API", async () => {
  const t = bootstrap();
  const res = await t.req("action=products&sku=%3Cscript%3E");
  assert.equal(res.status, 400);
  assert.equal(t.calls.length, 0);
});
