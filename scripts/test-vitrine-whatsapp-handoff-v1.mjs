import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vitrine=fs.readFileSync(new URL('../vitrine/index.html',import.meta.url),'utf8');

assert.equal(root,vitrine,'root and /vitrine storefronts must remain identical');

const send=root.match(/async function sendWhatsApp\(\)\{[\s\S]*?(?=\n\s*\$\('#globalSearchForm'\))/)?.[0]||'';
assert.ok(send,'sendWhatsApp must exist');
assert.match(root,/function reserveWhatsAppHandoff\(\)/,'must reserve a window during the user gesture');
assert.match(root,/function completeWhatsAppHandoff\(url,handoffWindow\)/,'must provide universal navigation fallback');
assert.match(root,/https:\/\/wa\.me\//,'must use official WhatsApp click-to-chat URL');
assert.doesNotMatch(send,/window\.location\.href\s*=\s*url/,'must not rely on late location.href only');
assert.ok(send.indexOf('reserveWhatsAppHandoff()') < send.indexOf('await lookupCheckoutCustomer()'),'window must be reserved before first await');
assert.match(send,/if\(!lookup\)\{[\s\S]*status:'new'/,'customer lookup failure must not block checkout');
assert.match(send,/renderWhatsAppHandoffSuccess\(url,saved\)/,'must expose manual fallback after order save');
assert.match(root,/target="_blank" rel="noopener">Abrir WhatsApp<\/a>/,'manual fallback must be a real user-clickable link');
assert.match(send,/completeWhatsAppHandoff\(url,handoffWindow\)/,'must complete reserved-window or same-window handoff');

console.log('vitrine WhatsApp handoff regression: ok');
