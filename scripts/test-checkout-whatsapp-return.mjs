import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const root=read('index.html'), vitrine=read('vitrine/index.html');
assert.equal(root,vitrine,'root and /vitrine storefronts must remain identical');
assert.match(root,/Finalizar pedido/,'ready checkout button must say Finalizar pedido');
assert.doesNotMatch(root,/window\.open\(['"]about:blank/,'checkout must not reserve a popup before order creation');
assert.doesNotMatch(root,/reserveWhatsAppHandoff/,'legacy popup reservation must be removed');
assert.match(root,/function scheduleWhatsAppReturn\(url,delayMs=3000\)/,'scheduled WhatsApp return helper required');
assert.match(root,/setTimeout\(\(\)=>\{try\{window\.location\.assign\(url\)/,'return must be best-effort same-window navigation');
assert.match(root,/Pedido recebido/,'success screen must confirm receipt');
assert.match(root,/confirmação será enviada ao seu WhatsApp/i,'success screen must explain automatic confirmation');
assert.match(root,/>Voltar ao WhatsApp<\/a>/,'manual WhatsApp fallback required');
assert.match(root,/>Voltar à vitrine<\/button>/,'stay/return to storefront action required');
const send=root.match(/async function sendWhatsApp\(\)\{[\s\S]*?(?=\n\s*\$\('#globalSearchForm'\))/)?.[0]||'';
assert.ok(send,'checkout submit handler must exist');
const savePos=send.indexOf("saved=await api('submit_order'");
const clearPos=send.indexOf('state.cart=[]');
const renderPos=send.indexOf('renderOrderSuccess(url,saved)');
const timerPos=send.indexOf('scheduleWhatsAppReturn(url,3000)');
assert.ok(savePos>=0&&clearPos>savePos,'cart may clear only after submit_order succeeds');
assert.ok(renderPos>clearPos&&timerPos>renderPos,'success screen must render before scheduled WhatsApp return');
assert.match(send,/const url='https:\/\/wa\.me\/'+resolveWhatsappDestination\(\);/,'return URL must open conversation without requiring prefilled order send');
assert.doesNotMatch(send,/\?text=/,'checkout must not depend on customer sending prefilled text');
for(const signal of ['INTERESSES_MKT','MARCAS_MKT']){
  assert.ok(root.includes(signal),`${signal} generation must remain available until marketing migration is completed`);
}
console.log('checkout WhatsApp return contract: ok');
