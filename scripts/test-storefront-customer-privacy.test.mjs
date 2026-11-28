import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const edge = readFileSync(new URL("../supabase/functions/storefront-v2/index.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../site/storefront/checkout.js", import.meta.url), "utf8");
const publicPages = ["../site/index.html", "../site/experimento.html", "../site/versao-anterior.html"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("phone lookup exposes only the verification requirement, never customer profile or addresses", () => {
  const start = edge.indexOf("function publicCustomerLookupResponse(");
  const end = edge.indexOf("async function allowCustomerAddressAttempts(", start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  runInNewContext(edge.slice(start, end) + "\nglobalThis.response = publicCustomerLookupResponse;", context);
  const found = JSON.parse(JSON.stringify(context.response(true, false)));
  assert.deepEqual(found, {
    ok: true,
    found: true,
    ambiguous: false,
    customer: { requires_document_verification: true },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.response(false, false))), {
    ok: true, found: false, ambiguous: false, customer: null,
  });
});

test("address lookup and creation verify the document before revealing or saving an address", () => {
  const addressLookup = edge.slice(edge.indexOf("async function customerAddressLookup("), edge.indexOf("async function customerAddressAdd("));
  const addressAdd = edge.slice(edge.indexOf("async function customerAddressAdd("), edge.indexOf("async function registerCustomer("));
  assert.match(addressLookup, /verifyCheckoutCustomerDocument\(req,input\)/);
  assert.match(addressLookup, /publicCheckoutCustomer\(verified\.customer\)/);
  assert.match(addressAdd, /verifyCheckoutCustomerDocument\(req,input\)/);
  assert.match(addressAdd, /p_document_last4:verified\.document_last4/);
  assert.doesNotMatch(addressAdd, /customer\.document_last4/);
});

test("every public checkout asks returning customers to verify before address access", () => {
  assert.match(checkout, /request\("customer_address_lookup"/);
  assert.match(checkout, /document_last4/);
  assert.match(checkout, /verifiedCustomerDocumentLast4/);
  for (const page of publicPages) {
    assert.match(page, /id="customer-document-verification"/);
    assert.match(page, /id="customer-document-last4"/);
  }
});
