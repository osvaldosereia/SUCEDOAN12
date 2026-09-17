import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918001000_customer_frequent_purchases_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const ui=fs.readFileSync('comprar/frequent-purchases-v1.js','utf8');
const html=fs.readFileSync('comprar/index.html','utf8');

assert.match(migration,/get_customer_frequent_purchases_v1/);
assert.match(migration,/count\(distinct o\.id\)/,'ranking deve usar pedidos distintos');
assert.match(migration,/cps\.purchase_count desc/);
assert.match(migration,/cps\.last_purchase_at desc/);
assert.match(migration,/cps\.total_quantity desc/);
assert.match(migration,/p\.physically_verified=true/);
assert.match(migration,/p\.is_active=true/);
assert.match(migration,/p\.is_whatsapp_active=true/);
assert.match(migration,/coalesce\(p\.stock,0\)>0/);
assert.match(migration,/favorite_basket/);
assert.match(migration,/recent_extras/);
assert.doesNotMatch(migration,/make\.com|hook\.eu1\.make/i);

assert.match(edge,/action==='frequent_purchases'/);
assert.match(edge,/get_customer_frequent_purchases_v1/);
assert.match(edge,/session\.customer_id/,'API pública deve derivar cliente da sessão');

assert.match(ui,/Minhas compras frequentes/);
assert.match(ui,/Adicionar novamente/);
assert.match(ui,/set_quantity/,'adição deve reutilizar a regra comercial atual do carrinho');
assert.match(ui,/app\.api\('open'\)/,'quantidade atual deve ser relida antes de somar');
assert.match(ui,/state\.customer\?\.id/);
assert.match(ui,/order_count\|\|0\)<2/,'um único pedido não deve virar hábito');
assert.match(ui,/state\.modules\?\.baskets/);
assert.match(ui,/Indisponível/);

const identity=html.indexOf('papo-identity-ui.js');
const repeat=html.indexOf('repeat-purchase-v1.js');
const frequent=html.indexOf('frequent-purchases-v1.js');
const start=html.indexOf('window.DA_COMPRAR_APP.start()');
assert.ok(identity>=0);
assert.ok(repeat>identity);
assert.ok(frequent>repeat);
assert.ok(start>frequent);
assert.match(html,/frequent-purchases-v1\.css/);

console.log('PASS: compras frequentes V1');
