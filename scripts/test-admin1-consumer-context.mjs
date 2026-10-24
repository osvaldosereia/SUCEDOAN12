import assert from "node:assert/strict";
import { summarizeAdmin1Consumer } from "../supabase/functions/admin1-products-read-v1/consumer-context.mjs";

const browser = summarizeAdmin1Consumer(new Request("https://function.example/?action=products", {
  headers: {
    origin: "https://donaantonia.com.br",
    referer: "https://donaantonia.com.br/vitrine/admin/?q=private-search&product_id=secret",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36"
  }
}), "products");

assert.deepEqual(browser, {
  action: "products",
  origin: "donaantonia.com.br",
  page: "vitrine-admin",
  caller: "browser-mobile",
  fetchSite: "same-origin"
});

const legacyPage = summarizeAdmin1Consumer(new Request("https://function.example/?action=matches&gtin=123", {
  headers: {
    origin: "https://www.donaantonia.com.br",
    referer: "https://www.donaantonia.com.br/admin1/catalog?gtin=private-identifier",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36"
  }
}), "matches");

assert.equal(legacyPage.page, "admin1");
assert.equal(legacyPage.origin, "www.donaantonia.com.br");
assert.equal(legacyPage.caller, "browser");

const edgeCaller = summarizeAdmin1Consumer(new Request("https://function.example/?action=matches", {
  headers: {
    "user-agent": "Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.77.7; ref=xaoeldjuxzsdsblimzxo)"
  }
}), "matches");

assert.deepEqual(edgeCaller, {
  action: "matches",
  origin: "none",
  page: "unknown",
  caller: "supabase-edge",
  fetchSite: "unknown"
});

const untrustedOrigin = summarizeAdmin1Consumer(new Request("https://function.example/?action=products", {
  headers: {
    origin: "https://attacker.example",
    referer: "https://attacker.example/anything?token=secret",
    "user-agent": "curl/8.0"
  }
}), "unexpected-private-action");

assert.deepEqual(untrustedOrigin, {
  action: "other",
  origin: "external",
  page: "other",
  caller: "other",
  fetchSite: "unknown"
});

const serialized = JSON.stringify([browser, legacyPage, edgeCaller, untrustedOrigin]);
assert.doesNotMatch(serialized, /private-search|secret|private-identifier|attacker\.example|xaoeldjuxzsdsblimzxo/);

console.log("Admin1 consumer context: PASS");
