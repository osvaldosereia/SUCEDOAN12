import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
for(const path of ['index.html','vitrine/index.html']){
  const html=read(path);
  const send=html.match(/async function sendWhatsApp\(\)\{[\s\S]*?(?=\n\s*\$\('#globalSearchForm'\))/)?.[0]||'';
  assert.ok(send,`${path}: checkout submit handler must exist`);
  assert.match(html,/checkoutSubmitInFlight:\s*false/,`${path}: storefront state must track checkout submit in flight`);
  assert.match(send,/if\(state\.checkoutSubmitInFlight\)return;/,`${path}: repeated taps must be ignored while a submit is active`);
  assert.match(send,/state\.checkoutSubmitInFlight=true/,`${path}: submit must acquire the lock before network work`);
  assert.match(send,/state\.checkoutSubmitInFlight=false/,`${path}: failed submit must release the lock for a legitimate retry`);
}
console.log('checkout submit lock contract: ok');
