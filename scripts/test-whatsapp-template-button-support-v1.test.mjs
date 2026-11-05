import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("Meta template editor uses the matching sample length for public links and legacy capabilities", () => {
  const context = { window: {} };
  runInNewContext(read("site/admin/whatsapp-template-button-support.js"), context);
  const support = context.window.DonaTemplateButtonSupport;
  const orderUrl = "https://donaantonia.com.br/p/?k={{1}}";
  const trackingUrl = "https://donaantonia.com.br/acompanhar/?k={{1}}";
  const legacyUrl = "https://donaantonia.com.br/pedido/?c={{1}}";
  const publicExample = "0123456789abcdef";
  const legacyExample = "0123456789abcdef".repeat(4);

  assert.equal(support.exampleForUrl(orderUrl), publicExample);
  assert.equal(support.exampleForUrl(trackingUrl), publicExample);
  assert.equal(support.exampleForUrl(legacyUrl), legacyExample);
  assert.equal(support.isValidExample(orderUrl, publicExample), true);
  assert.equal(support.isValidExample(orderUrl, legacyExample), false);
  assert.equal(support.isValidExample(legacyUrl, legacyExample), true);
});

test("admin loads the button sample helper before the WhatsApp template editor", () => {
  const html = read("site/admin/index.html");
  const helperIndex = html.indexOf("whatsapp-template-button-support.js?v=1");
  const adminIndex = html.indexOf("whatsapp-admin.js?v=30");
  const source = read("site/admin/whatsapp-admin.js");

  assert.notEqual(helperIndex, -1);
  assert.ok(adminIndex > helperIndex, "the helper must load before the editor script");
  assert.match(source, /DonaTemplateButtonSupport/);
});
