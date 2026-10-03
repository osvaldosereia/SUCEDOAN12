import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('pedido/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');

for(const legacy of ['SEPARATION_TAPS','SEPARATION_TAP_WINDOW_MS','activeTapIndex','handleProductTap','complete_separation','checked_indexes']){
  assert.equal(page.includes(legacy),false,`legacy public separation behavior must be retired: ${legacy}`);
}
assert.doesNotMatch(page,/Concluir separa[cç][aã]o/i,'customer storefront cannot conclude separation');
assert.doesNotMatch(edge,/completeSeparation|complete_separation|consume_vitrine_order_stock_v1|ops_start_order_check_v1|ops_finish_order_check_v1/i,'public Edge Function must not mutate separation or stock');
assert.match(edge,/req\.method!=="GET"/,'public Edge Function must be GET-only except OPTIONS');
assert.match(edge,/order_separation_items_v1/,'public Edge Function must read server-side item state');
assert.match(page,/Aguardando separa[cç][aã]o/,'customer can see pending state');
assert.match(page,/Separado/,'customer can see separated state');
assert.match(page,/Em falta/,'customer can see missing state');
assert.ok(!/login|senha|pin de seguran|c[oó]digo de acesso/i.test(page),'customer storefront must not introduce a login/PIN flow');

console.log('OK · legacy public triple-tap retired; customer storefront is read-only.');
