import fs from 'node:fs';
import assert from 'node:assert/strict';

const SQL='supabase/sql/20261006_basket_mold_cutover_r6.sql';
const MIG='supabase/migrations/20261006113000_basket_mold_cutover_r6.sql';
const EDGE='supabase/functions/storefront-v2/index.ts';

assert.equal(fs.existsSync(SQL),true,'R6 cutover SQL must exist');
assert.equal(fs.existsSync(MIG),true,'R6 cutover migration must exist');
const sql=fs.readFileSync(SQL,'utf8');
const mig=fs.readFileSync(MIG,'utf8');
const edge=fs.readFileSync(EDGE,'utf8');

for(const name of ['Econômica','Mini Só Alimento','Mini Completa','Pequena Só Alimento','Pequena Completa','Média Só Alimento','Média Completa','Grande Só Alimento','Grande Completa']){
  assert.ok(sql.includes(name),`R6 migration must configure ${name}`);
}
assert.match(sql,/legacy_source_basket_ids/i,'molds must remember legacy physical source baskets');
assert.match(sql,/legacy_first/i,'complete molds must use legacy-first transition');
assert.match(sql,/mold_legacy_source/i,'partner legacy templates must be marked as technical sources');
assert.match(sql,/mold_internal_legacy/i,'technical cleaning basket must be hidden from daily mold admin');
assert.match(sql,/base_price\s*-|current_product_total|effective_price/i,'hidden adjustment must be recalculated from current commercial price/components');
assert.match(sql,/admin_basket_mold_list_v1/i,'R6 must harden the daily admin list');
assert.doesNotMatch(sql,/release_legacy_basket_lot_units_v1/i,'R6 must not dismantle physical legacy lots');
assert.doesNotMatch(sql,/update\s+public\.basket_stock_lots/i,'R6 must not mutate physical lot balances');
assert.equal(sql,mig,'canonical SQL and migration must stay byte-for-byte aligned');

assert.match(edge,/legacy_source_basket_ids/i,'storefront must read mold legacy sources');
assert.match(edge,/legacy_first/i,'storefront must understand legacy-first cutover');
assert.match(edge,/basket_commercial_catalog_v1/i,'storefront must inspect real public legacy availability');
assert.match(edge,/public_available/i,'storefront cutover must depend on physical public availability');
assert.match(edge,/moldHomeCards/i,'cutover must remain inside the canonical mold card generator');

console.log('Basket mold cutover R6 contract: PASS');
