import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const root=read('index.html'), vitrine=read('vitrine/index.html');
assert.equal(root,vitrine,'root and /vitrine storefronts must remain identical');
assert.match(root,/Finalizar pedido/,'ready checkout button must say Finalizar pedido');
assert.doesNotMatch(root,/window\.open\(['"]about:blank/,'checkout must not reserve a popup before order creation');
assert.doesNotMatch(root,/reserveWhatsAppHandoff/,'legacy popup reservation must be removed');
assert.match(root,/function scheduleWhatsAppReturn\(url,delayMs=0\)/,'WhatsApp return must default to immediate');
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
const timerPos=send.indexOf('scheduleWhatsAppReturn(url,0)');
assert.ok(savePos>=0&&clearPos>savePos,'cart may clear only after submit_order succeeds');
assert.ok(renderPos>clearPos&&timerPos>renderPos,'success state must be prepared before immediate WhatsApp return');
assert.match(send,/const url='https:\/\/wa\.me\/'\+resolveWhatsappDestination\(\);/,'legacy handler may keep its fallback return URL');
assert.doesNotMatch(send,/\?text=/,'checkout must not depend on customer sending prefilled text');
assert.doesNotMatch(send,/const\s+lines\s*=|PEDIDO DONA ANTONIA|INTERESSES_MKT|MARCAS_MKT/,'successful order path must not build an obsolete free-form WhatsApp message after persistence');
assert.doesNotMatch(send,/const\s+marketingSignals\s*=\s*buildMarketingSignals\(\)/,'successful order path must not perform unused marketing work before showing success');
assert.match(root,/function buildMarketingSignals\(\)/,'marketing signal helper remains available for the dedicated marketing migration');

const resilience=read('checkout-resilience.js');
assert.match(resilience,/whatsapp_return_phone/,'resilience layer must consume the authoritative WhatsApp return phone from submit_order');
assert.match(resilience,/pendingWhatsappReturnUrl/,'resilience layer must hold the authoritative return URL until navigation');
assert.match(resilience,/location\.assign/,'resilience layer must redirect to the authoritative WhatsApp conversation');
assert.match(resilience,/wa-fallback/,'manual fallback link must be corrected to the authoritative WhatsApp conversation');

const migration=read('supabase/migrations/20261002150000_checkout_whatsapp_return_channel.sql');
assert.match(migration,/whatsapp_return_phone/,'order result must expose the phone of the channel chosen for the confirmation');
assert.match(migration,/whatsapp_return_origin/,'order result must expose the origin chosen for the confirmation');
assert.match(migration,/ops2_whatsapp_outbox_v1/,'return channel must come from the same customer outbox used by the confirmation');
assert.match(migration,/recipient_kind\s*=\s*'customer'/i,'return channel lookup must use the customer confirmation row');

console.log('checkout WhatsApp return contract: ok');

assert.doesNotMatch(root,/Voltando para a conversa em 3 segundos/i,'legacy 3-second copy must be removed');
assert.match(root,/max-width:min\(520px,calc\(100vw - 32px\)\)/,'toast must have responsive readable width');
assert.match(root,/white-space:normal/,'toast must wrap long messages');
