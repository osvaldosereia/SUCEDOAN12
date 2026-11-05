import test from "node:test";
import assert from "node:assert/strict";
import { buildOrderSeparationComponents } from "../supabase/functions/_shared/order-separation-components-v1.mjs";

const buttonTemplate = [
  { type: "BODY", text: "Pedido {{1}} separado. Total {{2}}." },
  { type: "BUTTONS", buttons: [
    { type: "URL", text: "Conferir pedido", url: "https://donaantonia.com.br/p/?k={{1}}" },
    { type: "URL", text: "Acompanhar entrega", url: "https://donaantonia.com.br/acompanhar/?k={{1}}" },
  ] },
];

test("button template sends body values and one public token to each URL button", () => {
  const result = buildOrderSeparationComponents(
    "prepared_ok", ["DA066", "R$ 120,00"], "1234567890abcdef", "https://donaantonia.com.br/p/?k=1234567890abcdef", buttonTemplate,
  );
  assert.deepEqual(result[0].parameters.map((item) => item.text), ["DA066", "R$ 120,00"]);
  assert.deepEqual(result.slice(1).map((item) => item.index), ["0", "1"]);
  assert.deepEqual(result.slice(1).map((item) => item.parameters[0].text), ["1234567890abcdef", "1234567890abcdef"]);
});

test("legacy body-only template continues receiving the complete order URL", () => {
  const result = buildOrderSeparationComponents(
    "prepared_ok", ["DA066", "R$ 120,00"], "1234567890abcdef", "https://donaantonia.com.br/p/?k=1234567890abcdef",
    [{ type: "BODY", text: "Pedido {{1}} total {{2}}. Link {{3}}" }],
  );
  assert.deepEqual(result, [{ type: "body", parameters: [
    { type: "text", text: "DA066" }, { type: "text", text: "R$ 120,00" },
    { type: "text", text: "https://donaantonia.com.br/p/?k=1234567890abcdef" },
  ] }]);
});

test("unsupported template layouts and malformed public tokens are not sendable", () => {
  assert.equal(buildOrderSeparationComponents("prepared_ok", ["DA066", "R$ 120"], "bad", "https://donaantonia.com.br/p/?k=bad", buttonTemplate), null);
  assert.equal(buildOrderSeparationComponents("prepared_ok", ["DA066", "R$ 120"], "1234567890abcdef", "https://donaantonia.com.br/p/?k=1234567890abcdef", [{ type: "BODY", text: "{{1}} {{2}}" }]), null);
});
