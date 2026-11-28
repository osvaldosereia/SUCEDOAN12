import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const has = (path) => existsSync(new URL(path, root));
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("the admin loads exactly one copy of the WhatsApp editor", () => {
  const references = [...read("site/admin/index.html").matchAll(/<script\b[^>]*\bsrc="(whatsapp-admin[^"?]*\.js)(?:\?[^"]*)?"/g)];
  assert.deepEqual(references.map((ref) => ref[1]), ["whatsapp-admin-fixed.js"]);
  assert.ok(has("site/admin/whatsapp-admin-fixed.js"));
  assert.ok(!has("site/admin/whatsapp-admin.js"));
  assert.ok(!has("site/admin/whatsapp-admin-runtime.js"));
});

test("the public checkout pages use a common version of the checkout code", () => {
  const entries = ["site/index.html", "site/experimento.html", "site/versao-anterior.html"];
  const versions = entries.map((entry) => {
    const scripts = [...read(entry).matchAll(/<script\b[^>]*\bsrc="storefront\/checkout\.js\?v=([1-9]\d*)"/g)];
    assert.equal(scripts.length, 1, entry);
    return scripts[0][1];
  });
  assert.equal(new Set(versions).size, 1);
});

test("the driver redirect does not ship the retired driver interface", () => {
  assert.match(read("site/entregador/index.html"), /\/site\/admin\/\?view=delivery/);
  assert.ok(!has("site/entregador/driver.js"));
  assert.ok(!has("site/entregador/driver.css"));
});
