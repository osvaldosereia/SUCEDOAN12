import fs from 'node:fs';
import assert from 'node:assert/strict';
const ids=fs.readFileSync('vitrine/admin/core/identifiers.js','utf8');
const wa=fs.readFileSync('vitrine/admin/orders/whatsapp-links.js','utf8');
const global={};
new Function('window',ids)(global);
new Function('window',wa)(global);
const {phoneDigits}=global.DonaAntoniaAdminIdentifiers;
const {whatsappHref,whatsappMessageHref}=global.DonaAntoniaAdminWhatsappLinks;
for(const [raw,digits,href] of [
  ['(65) 99999-9999','5565999999999','https://wa.me/5565999999999'],
  ['65 3333-3333','556533333333','https://wa.me/556533333333'],
  ['+55 (65) 99999-9999','5565999999999','https://wa.me/5565999999999'],
  ['','', ''],
  ['123','123',''],
]){
  assert.equal(phoneDigits(raw),digits);
  assert.equal(whatsappHref(raw),href);
}
assert.equal(whatsappMessageHref('65999999999','Olá & tudo bem?'),'https://wa.me/5565999999999?text=Ol%C3%A1%20%26%20tudo%20bem%3F');
assert.equal(whatsappMessageHref('123','msg'),'');
console.log('Admin WhatsApp phone normalization contract: PASS');
