import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261006_basket_mold_storefront_checkout_v1.sql';
const apiPath='supabase/functions/storefront-v2/index.ts';
const rootPath='index.html';
const vitrinePath='vitrine/index.html';

assert.equal(fs.existsSync(sqlPath),true,'R5 checkout SQL must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const root=fs.readFileSync(rootPath,'utf8');
const vitrine=fs.readFileSync(vitrinePath,'utf8');

assert.match(sql,/basket_mold/i,'checkout must have a mold-specific path');
assert.match(sql,/basket_mold_positions/i,'server must validate mold positions');
assert.match(sql,/basket_mold_position_options/i,'server must validate allowed product options');
assert.match(sql,/hidden_adjustment/i,'fixed hidden value must be applied server-side');
assert.match(sql,/ops2_loose_sellable_stock_v1/i,'selected mold products must be revalidated against canonical loose stock');
assert.match(sql,/basket_mold_component/i,'mold components must be recorded explicitly in order items');
assert.match(sql,/basket_mold_not_configured|basket_mold_unavailable/i,'missing mold must fail closed');
assert.match(sql,/basket_mold_option_invalid|basket_mold_component_invalid/i,'unapproved substitutions must fail closed');
assert.doesNotMatch(sql,/insert\s+into\s+public\.basket_stock_lots/i,'R5 must not create fake physical lots');

assert.match(api,/basket_mold_public_compositions_v2/i,'storefront must consume the canonical mold generator');
assert.match(api,/mold_mode\s*:\s*true/i,'public cards must identify mold compositions');
assert.match(api,/composition_number/i,'public cards/details must keep composition identity');
assert.match(api,/basket_mold/i,'storefront API must expose mold detail/order payloads');

for(const [name,html] of [['root',root],['vitrine',vitrine]]){
  assert.match(html,/type:\s*['"]basket_mold['"]/i,`${name} must put mold compositions in cart as basket_mold`);
  assert.match(html,/composition_number/i,`${name} must keep selected composition number`);
  assert.match(html,/position_id/i,`${name} must send selected mold positions`);
  assert.match(html,/item\.type===['"]basket_mold['"]|item\.type===\"basket_mold\"/i,`${name} checkout must recognize basket_mold cart lines`);
  assert.doesNotMatch(html,/basket_mold[^\n]{0,180}(?:lot_id|food_lot_id)/i,`${name} must not invent a physical lot for mold compositions`);
}

console.log('basket mold storefront R5: PASS');
