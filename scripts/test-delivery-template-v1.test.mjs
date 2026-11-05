import test from "node:test";
import assert from "node:assert/strict";
import { validateTemplateDraft } from "../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs";
import { sendTemplateViaMeta } from "../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs";
import { buildOrderSeparationComponents } from "../supabase/functions/_shared/order-separation-components-v1.mjs";

test("order notification templates may use public token links for both order and delivery buttons", () => {
  const draft = validateTemplateDraft({
    name: "pedidopreparadook0975v2",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Pedido {{1}} separado. Total: {{2}}.", example: { body_text: [["DA066", "R$ 120,00"]] } },
      { type: "BUTTONS", buttons: [
        { type: "URL", text: "Conferir pedido", url: "https://donaantonia.com.br/p/?k={{1}}", example: ["1234567890abcdef"] },
        { type: "URL", text: "Acompanhar entrega", url: "https://donaantonia.com.br/acompanhar/?k={{1}}", example: ["1234567890abcdef"] },
      ] },
    ],
  });
  assert.equal(draft.components[1].buttons.length, 2);
});

test("order tracking URL button rejects unrelated hosts and query shapes", () => {
  assert.throws(() => validateTemplateDraft({
    name: "pedidopreparadook0975v2",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Pedido {{1}}.", example: { body_text: [["DA066"]] } },
      { type: "BUTTONS", buttons: [
        { type: "URL", text: "Conferir pedido", url: "https://example.com/p/?k={{1}}", example: ["1234567890abcdef"] },
      ] },
    ],
  }), /buttons_invalid/i);
});

test("prepared order URL buttons with public tokens pass through the Meta transport", async () => {
  const token = "1234567890abcdef";
  const orderUrl = `https://donaantonia.com.br/p/?k=${token}`;
  const templateComponents = [
    { type: "BODY", text: "Pedido {{1}}. Total {{2}}." },
    { type: "BUTTONS", buttons: [
      { type: "URL", text: "Conferir pedido", url: "https://donaantonia.com.br/p/?k={{1}}" },
      { type: "URL", text: "Acompanhar entrega", url: "https://donaantonia.com.br/acompanhar/?k={{1}}" },
    ] },
  ];
  const components = buildOrderSeparationComponents("prepared_ok", ["DA123", "R$ 9,90"], token, orderUrl, templateComponents);
  assert.ok(components, "components builder must produce the two URL buttons");

  const calls = [];
  await sendTemplateViaMeta({
    accessToken: "test-token",
    phoneNumberId: "123456789",
    toE164: "+5565999999999",
    templateName: "pedidopreparadook0975v2",
    languageCode: "pt_BR",
    graphVersion: "v22.0",
    components,
    fetchImpl: async (url, init) => {
      calls.push({ url, payload: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.stub" }] }) };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload.template.components.slice(1).map((button) => button.parameters[0].text), [token, token]);
});
