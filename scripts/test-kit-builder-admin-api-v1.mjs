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

for(const action of ['kits','kit','kit_save','kit_archive','products','most_used','chips','chip_save','chip_archive','chip_reorder']){
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
assert.ok(mostUsedStart>=0,'mostUsed function must exist');
const mostUsedSource=source.slice(mostUsedStart,source.indexOf('\nasync function',mostUsedStart+20)>0?source.indexOf('\nasync function',mostUsedStart+20):source.length);
assert.match(mostUsedSource,/assembly_kits/i,'most used must derive from kits');
assert.match(mostUsedSource,/is_active/i,'most used must use active kits only');
assert.match(mostUsedSource,/count|usage_count/i,'most used must aggregate usage');

assert.doesNotMatch(source,/DonaAntoniaBasketGuided|basket_kit_template_items|basket_lot_substitution_/i,'new kit API must not depend on guided/family-position domain');

console.log('kit builder admin api v1: PASS');
