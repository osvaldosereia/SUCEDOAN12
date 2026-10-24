import assert from "node:assert/strict";
import { isExactMarketingOptOutReply } from "../supabase/functions/_shared/marketing-optout-keyword-v1.mjs";

for (const value of ["SAIR", " sair ", "Sair"]) {
  assert.equal(isExactMarketingOptOutReply(value), true, `should accept exact keyword: ${JSON.stringify(value)}`);
}

for (const value of [
  "quero sair",
  "vou sair mais tarde",
  "não quero sair",
  "saindo",
  "sair, por favor",
  "SAIR das compras",
  "",
  null,
]) {
  assert.equal(isExactMarketingOptOutReply(value), false, `should reject contextual text: ${JSON.stringify(value)}`);
}
