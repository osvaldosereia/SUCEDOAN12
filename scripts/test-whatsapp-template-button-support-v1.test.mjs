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
  const helperIndex = html.indexOf("whatsapp-template-button-support.js?v=");
  const adminIndex = html.indexOf("whatsapp-admin-fixed.js?v=");
  const source = read("site/admin/whatsapp-admin-fixed.js");

  assert.notEqual(helperIndex, -1);
  assert.ok(adminIndex > helperIndex, "the helper must load before the editor script");
  assert.match(source, /DonaTemplateButtonSupport/);
});

test("the editor replaces the sample when a link changes between public and legacy formats", () => {
  const window = {};
  const source = read("site/admin/whatsapp-admin-fixed.js");
  const start = source.indexOf("  const TEMPLATE_BUTTON_");
  const end = source.indexOf("  function syncTemplateButtonControls", start);
  const prefix = source.slice(start, end);
  const helper = read("site/admin/whatsapp-template-button-support.js");
  runInNewContext(helper + "\n" + prefix + "\nwindow.syncTemplateButtonRow = syncTemplateButtonRow;", { window, esc: String });
  const fields = {
    "[data-template-button-type]": { value: "URL" },
    "[data-template-button-url]": { value: "https://donaantonia.com.br/p/?k={{1}}" },
    "[data-template-button-example]": { value: "0123456789abcdef".repeat(4) },
  };
  const row = { querySelector: (selector) => fields[selector] || null };
  const sample = fields["[data-template-button-example]"];
  window.syncTemplateButtonRow(row);
  assert.equal(sample.value.length, 16);
  fields["[data-template-button-url]"].value = "https://donaantonia.com.br/pedido/?c={{1}}";
  window.syncTemplateButtonRow(row);
  assert.equal(sample.value.length, 64);
});

test("saving a newly pasted public URL uses a short sample without waiting for the change event", () => {
  const window = {};
  const source = read("site/admin/whatsapp-admin-fixed.js");
  const helper = read("site/admin/whatsapp-template-button-support.js");
  const start = source.indexOf("  const TEMPLATE_BUTTON_");
  const end = source.indexOf("  async function submitTemplateEditor", start);
  runInNewContext(helper + "\n" + source.slice(start, end) + "\nwindow.draft = templateDraftFromForm;", { window });
  const row = { querySelector: (selector) => ({
    "[data-template-button-type]": { value: "URL" },
    "[data-template-button-text]": { value: "Ver pedido" },
    "[data-template-button-url]": { value: "https://donaantonia.com.br/p/?k={{1}}" },
    "[data-template-button-example]": { value: "0123456789abcdef".repeat(4) },
  })[selector] || null };
  const form = {
    querySelector: (selector) => selector === "[data-template-body]" ? { value: "Pedido recebido" } : null,
    querySelectorAll: () => [row],
  };
  const buttons = window.draft(form).components.find((component) => component.type === "BUTTONS");
  assert.equal(buttons.buttons[0].example[0].length, 16);
});
