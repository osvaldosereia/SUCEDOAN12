import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/reason:"product_not_linked",[\s\S]*?sku:clean\(item\?\.sku,120\),gtin:blingHubDigits\(item\?\.gtin\),name:clean\(item\?\.name,220\)/);

assert.match(vitrine,/process_product_jobs/);
assert.match(vitrine,/async function createMissingBlingProductsForOrder\(orderId:string\)/);
assert.match(vitrine,/operation:"create_product"/);
assert.match(vitrine,/requested_from:"order_preflight"/);
assert.match(vitrine,/blingHubControl\("process_product_jobs"/);
assert.match(vitrine,/action==="bling_create_order_products"/);

assert.match(html,/Cadastrar produtos no Bling/);
assert.match(html,/Produtos sem vínculo:/);
assert.match(html,/async function createCurrentOrderProductsInBling\(\)/);
assert.match(html,/O Hub verifica GTIN\/código antes de criar para evitar duplicidade/);
assert.match(html,/bling_create_order_products/);
assert.match(html,/Produtos vinculados · pedido revalidado/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cadastro explícito de produtos ausentes no Bling');
