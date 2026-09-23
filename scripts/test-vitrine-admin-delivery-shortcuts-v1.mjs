import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(html,/function orderSearchMatch\(o,q\)/);
assert.match(html,/id="orderSearch"/);
assert.match(html,/id="expeditionSearch"/);
assert.match(html,/function relativeAge\(v\)/);
assert.match(html,/function whatsappHref\(value\)/);
assert.match(html,/function mapsHrefFromAddress\(a\)/);
assert.match(html,/https:\/\/wa\.me\//);
assert.match(html,/https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
assert.match(html,/orderContactActionsHtml\(o,c\)/);
assert.match(html,/data-expedition-order/);
assert.match(fn,/whatsapp_phone_e164/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · busca, tempo e atalhos de entrega');
