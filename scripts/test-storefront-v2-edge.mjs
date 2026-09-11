import fs from 'node:fs';
import assert from 'node:assert/strict';

const edgePath='supabase/functions/storefront-v2/index.ts';
assert.ok(fs.existsSync(edgePath),'Edge Function storefront-v2 ainda não existe');
const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

for(const action of ['list_baskets','get_basket','list_sections','list_products','lookup_customer_by_phone','create_order']) {
  assert.match(edge,new RegExp(action));
}
assert.match(edge,/create_storefront_order_v2/);
assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(config,/\[functions\.storefront-v2\][\s\S]*?verify_jwt\s*=\s*false/i);

for(const forbidden of [/graph\.facebook/i,/meta.*api/i,/firebase/i,/make\.com/i,/conversation-worker/i,/whatsapp-flow/i]) {
  assert.doesNotMatch(edge,forbidden);
}

const lookupBlock=edge.match(/lookup_customer_by_phone[\s\S]{0,4500}/i)?.[0]||'';
assert.doesNotMatch(lookupBlock,/cpf_cnpj|delivery_address|customer_addresses|email/i,'lookup público não deve expor cadastro completo');

assert.match(edge,/https:\/\/donaantonia\.com\.br/i,'CORS deve reconhecer o domínio oficial');
assert.match(edge,/https:\/\/www\.donaantonia\.com\.br/i,'CORS deve reconhecer o domínio www oficial');
assert.doesNotMatch(edge,/Access-Control-Allow-Origin["']\s*:\s*["']\*["']/i,'CORS público não deve usar wildcard');
assert.match(edge,/consume_public_rate_limit/i,'endpoint público deve usar limitador de requisições');
assert.match(lookupBlock,/consume_public_rate_limit/i,'consulta por telefone precisa de rate limit');
const createBlock=edge.match(/action\s*===\s*["']create_order["'][\s\S]{0,4500}/i)?.[0]||'';
assert.match(createBlock,/consume_public_rate_limit/i,'criação de pedido precisa de rate limit');

console.log('storefront-v2-edge ok');
