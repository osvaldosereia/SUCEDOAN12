import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/functions/admin-kit-builder-v1/index.ts';
assert.ok(fs.existsSync(path),`missing ${path}`);
const source=fs.readFileSync(path,'utf8');

assert.match(source,/npm:@supabase\/supabase-js@2\.58\.0/,'supabase-js must stay pinned');
assert.match(source,/db\.auth\.getUser\(token\)/,'must validate JWT with getUser');
assert.match(source,/from\("admin_users"\)[\s\S]*is_active/i,'must authorize against active admin_users');
assert.match(source,/role[^\n]*viewer|viewer[^\n]*role/i,'viewer role must be recognized');
assert.match(source,/viewer[\s\S]{0,300}(forbidden|403)|forbidden[\s\S]{0,300}viewer/i,'viewer must be read-only');

for(const action of ['kits','kit','kit_save','kit_archive','products','most_used','basket_products','chips','chip_save','chip_archive','chip_reorder']){
  assert.match(source,new RegExp(`['\"]${action}['\"]`),`missing action ${action}`);
}

assert.match(source,/from\("assembly_kits"\)/,'kits must use assembly_kits');
assert.match(source,/from\("assembly_kit_items"\)/,'kit items must use assembly_kit_items');
assert.match(source,/from\("assembly_search_chips"\)/,'chips must use assembly_search_chips');
assert.match(source,/rpc\("save_assembly_kit_v1"/,'kit_save must delegate to canonical RPC');
assert.match(source,/rpc\("archive_assembly_kit_v1"/,'kit_archive must delegate to canonical RPC');

assert.match(source,/from\("ops2_loose_sellable_stock_v1"\)/,'product stock must use canonical loose stock view');
for(const field of ['effective_sellable_stock','basket_locked_quantity','loose_sellable_stock']){
  assert.match(source,new RegExp(field),`products must expose ${field}`);
}
assert.match(source,/from\("bling_hub_runtime_v2"\)/,'API must expose stock authority');
assert.match(source,/ops2_stock_authority/,'stock authority field must be read');

assert.match(source,/name\.ilike|name,sku,gtin/i,'product search must cover name');
assert.match(source,/sku\.ilike|name,sku,gtin/i,'product search must cover SKU');
assert.match(source,/gtin\.ilike|name,sku,gtin/i,'product search must cover EAN/GTIN');
assert.match(source,/range\(|offset/i,'product search must paginate');
assert.match(source,/limit/i,'product search must cap page size');

const mostUsedStart=source.indexOf('async function mostUsed');
assert.ok(mostUsedStart>=0,'mostUsed function must exist for compatibility');
const mostUsedSource=source.slice(mostUsedStart,source.indexOf('\nasync function',mostUsedStart+20)>0?source.indexOf('\nasync function',mostUsedStart+20):source.length);
assert.match(mostUsedSource,/assembly_kits/i,'most used compatibility endpoint must derive from kits');

const basketProductsStart=source.indexOf('async function basketProducts');
assert.ok(basketProductsStart>=0,'basketProducts function must exist');
const basketProductsEnd=source.indexOf('\nasync function',basketProductsStart+20);
const basketProductsSource=source.slice(basketProductsStart,basketProductsEnd>basketProductsStart?basketProductsEnd:source.length);
assert.match(basketProductsSource,/basket_templates/i,'basket products must derive from commercial baskets');
assert.match(basketProductsSource,/is_active/i,'basket products must consider active baskets only');
assert.match(basketProductsSource,/store_basket_recipe_kits/i,'basket products must follow canonical recipe links');
assert.match(basketProductsSource,/assembly_kit_items|kitItemsFor/i,'basket products must expand kit items');
assert.match(basketProductsSource,/basket_usage_count/i,'basket products must expose basket usage count');
assert.match(basketProductsSource,/basket_names/i,'basket products must expose basket names');
assert.match(basketProductsSource,/stockMap|loose_sellable_stock/i,'basket products must expose canonical stock context');

assert.doesNotMatch(source,/DonaAntoniaBasketGuided|basket_kit_template_items|basket_lot_substitution_/i,'new kit API must not depend on guided/family-position domain');

console.log('kit builder admin api v2 basket products: PASS');
