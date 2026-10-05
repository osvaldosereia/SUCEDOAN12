import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const commerce=fs.readFileSync('supabase/sql/20261004_basket_canonical_commerce_v1.sql','utf8');
const createSql=fs.readFileSync('supabase/sql/20261004_basket_commercial_create_v1.sql','utf8');
const categorySql=fs.readFileSync('supabase/sql/20261004_basket_category_required_v1.sql','utf8');
const publicRoot=fs.readFileSync('index.html','utf8');
const publicVitrine=fs.readFileSync('vitrine/index.html','utf8');

const catalog=commerce.slice(commerce.indexOf('create or replace view public.basket_commercial_catalog_v1'),commerce.indexOf('create or replace view public.basket_current_lot_v1'));
assert.match(catalog,/from public\.basket_templates bt/i,'commercial catalog must be based on basket_templates');
assert.doesNotMatch(catalog,/union all[\s\S]*from public\.basket_kit_templates k/i,'internal kit templates must not become a second commercial entity');
assert.match(createSql,/create or replace function public\.create_basket_commercial_model_v1/i,'atomic commercial model creator is required');
assert.match(createSql,/insert into public\.basket_templates/i,'creator must create the commercial Cesta\/Kit');
assert.match(createSql,/insert into public\.basket_kit_templates/i,'creator must create its internal primary composition');
assert.match(createSql,/grant execute on function public\.create_basket_commercial_model_v1/i,'service role execution contract is required');
assert.match(createSql,/revoke all on function public\.create_basket_commercial_model_v1[\s\S]*from public,anon,authenticated/i,'creator must not be exposed directly to storefront users');
assert.match(categorySql,/basket_templates_category_required/i,'every commercial Cesta\/Kit must have a public category');
assert.match(categorySql,/check \(category_id is not null\)/i,'category constraint must reject uncategorized commercial models');

assert.match(backend,/"basket_commercial_create"/,'admin action must be registered');
assert.match(backend,/async function basketCommercialCreate\(/,'admin backend must expose create helper');
assert.match(backend,/create_basket_commercial_model_v1/,'admin backend must call the atomic creator');
assert.match(backend,/a==="basket_commercial_create"/,'POST route must exist');

assert.match(admin,/DonaAntoniaBasketAdmin\?\.render/,'index must delegate the primary Cestas/Kits page');
assert.match(section,/Nova Cesta\/Kit/,'primary page must expose one create action');
assert.match(section,/basket_commercial_create/,'fast flow must persist through canonical create action');
assert.match(section,/category_id/,'category is required during creation');
assert.match(section,/base_price_cents/,'price is set during creation');
assert.match(section,/function openGuided\(/,'canonical section must own the guided-editor adapter');
assert.match(section,/openGuided\(created,['"]lot['"]\)/,'after model creation the guided editor must open in lot mode');
assert.match(section,/g\.open\(m\.commercial_id/,'guided-editor adapter must delegate to DonaAntoniaBasketGuided.open');
assert.doesNotMatch(section,/openBasketKitAdmin|startBasketKitLotDraft/,'commercial creation must never fall back to legacy composers');
assert.match(guided,/Criar lote \/ reservar/,'first lot is created inside the guided editor');

for(const source of [publicRoot,publicVitrine]){
  assert.match(source,/basket_categories/,'public site must consume basket categories separately');
  assert.match(source,/basketCategory/,'public site must track the active Cesta\/Kit category');
  assert.match(source,/category_slug/,'basket cards must be filtered by their Cesta\/Kit category');
  assert.match(source,/Cestas e Kits/,'public heading must use the unified name');
  assert.match(source,/data-basket-category/,'public site must render category controls for Cestas\/Kits');
  assert.match(source,/Itens do kit/,'kit composition must not be mislabeled as food');
  assert.match(source,/basketGroupTitle\(group,b\)/,'composition label must consider the commercial category');
}
assert.equal(publicRoot,publicVitrine,'root and /vitrine public storefronts must stay identical');

const promotionPath='supabase/migrations/20261005021000_basket_promote_legacy_standalone_kits_v1.sql';
assert.ok(fs.existsSync(promotionPath),'legacy standalone kits must be promoted into the unified commercial model');
const promotion=fs.readFileSync(promotionPath,'utf8');
assert.match(promotion,/basket_kit_templates[\s\S]*basket_id is null[\s\S]*category_id is not null/i,'promotion must target categorized standalone kit templates');
assert.match(promotion,/insert into public\.basket_templates/i,'promotion must create the single commercial Cesta\/Kit record');
assert.match(promotion,/update public\.basket_kit_templates[\s\S]*basket_id/i,'promotion must bind the existing internal kit template instead of duplicating its composition');
assert.match(promotion,/update public\.basket_stock_lots[\s\S]*basket_id/i,'existing draft and ready kit lots must follow the promoted commercial model');
assert.doesNotMatch(promotion,/insert into public\.basket_kit_template_items/i,'promotion must preserve existing kit composition without cloning items');

console.log('basket unified commercial model: PASS');
