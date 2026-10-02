import fs from 'node:fs';
import assert from 'node:assert/strict';

const sf=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
for(const page of ['index.html','vitrine/index.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.match(html,/function checkoutRegistrationDraft\(/,`${page}: finalização precisa capturar os campos vivos do cadastro`);
  assert.match(html,/customer_draft:registrationDraft/,`${page}: pedido precisa enviar o rascunho cadastral ao backend`);
  assert.match(html,/persistRegistrationBeforeOrder\(info,registrationDraft\)/,`${page}: cadastro completo deve ser salvo automaticamente ao finalizar`);
  assert.match(html,/function checkoutPhoneData\(\)\{const ddd=phoneDigits\(\$\('#checkoutDdd'\)\?\.value\?\?state\.checkoutDdd,2\)/,`${page}: telefone deve ser lido diretamente do campo no clique final`);
  assert.match(html,/'"':'&quot;'/,`${page}: escape de aspas em atributos precisa permanecer válido`);
}
assert.match(sf,/const draftObj=p\?\.customer_draft&&typeof p\.customer_draft==="object"/,`backend precisa aceitar customer_draft`);
assert.match(sf,/customer_name:draftName/,`nome digitado precisa acompanhar o pedido`);
assert.match(sf,/street:draftStreet/,`endereço digitado precisa acompanhar o pedido`);
assert.match(sf,/name:draftName,display_name:draftName/,`nome digitado precisa entrar no snapshot do pedido`);
assert.match(sf,/phone_e164:ph/,`telefone normalizado precisa entrar no snapshot do pedido`);
console.log('checkout customer capture contract: OK');
