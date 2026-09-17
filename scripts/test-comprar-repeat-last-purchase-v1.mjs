import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260917235000_repeat_last_purchase_room_v1.sql','utf8')
  +fs.readFileSync('supabase/migrations/20260917235600_fix_repeat_last_purchase_cart_id_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const ui=fs.readFileSync('comprar/repeat-purchase-v1.js','utf8');
const html=fs.readFileSync('comprar/index.html','utf8');

assert.match(migration,/room_repeat_last_purchase_preview_v1/);
assert.match(migration,/room_repeat_last_purchase_apply_v1/);
assert.match(migration,/is_customer_purchase_valid_v1/);
assert.match(migration,/room_start_basket/);
assert.match(migration,/room_set_product_quantity/);
assert.match(migration,/room_set_basket_quantity/);
assert.match(migration,/repeated_from_order_id/);
assert.match(migration,/customer_behavior_events/);
assert.doesNotMatch(migration,/make\.com|hook\.eu1\.make/i);

assert.match(edge,/repeat_last_purchase_preview/);
assert.match(edge,/repeat_last_purchase_apply/);
assert.match(edge,/p_public_token:token/);

assert.match(ui,/Repetir última compra/);
assert.match(ui,/repeat_last_purchase_preview/);
assert.match(ui,/repeat_last_purchase_apply/);
assert.match(ui,/Valor anterior/);
assert.match(ui,/Estimativa hoje/);
assert.match(ui,/Repetir esta compra/);
assert.match(ui,/customer\?\.id/);
assert.match(ui,/cartCount/);
assert.match(ui,/location\.reload/);

const identityIndex=html.indexOf('papo-identity-ui.js');
const repeatIndex=html.indexOf('repeat-purchase-v1.js');
const startIndex=html.indexOf('window.DA_COMPRAR_APP.start()');
assert.ok(identityIndex>=0,'Papo identity deve estar carregado');
assert.ok(repeatIndex>identityIndex,'Repeat deve envolver o start depois da identidade');
assert.ok(startIndex>repeatIndex,'Repeat deve carregar antes de iniciar o app');
assert.match(html,/repeat-purchase-v1\.css/);

console.log('PASS: repetir última compra no Chat Comprar V1');
