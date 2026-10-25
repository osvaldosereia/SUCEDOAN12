import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readAdminUiSource} from './helpers/admin-ui-source.mjs';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const adminUi=readAdminUiSource();
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const storeUi=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const commerce=fs.readFileSync('supabase/sql/20261004_basket_canonical_commerce_v1.sql','utf8');
const createSql=fs.readFileSync('supabase/sql/20261004_basket_commercial_create_v1.sql','utf8');
const storeSql=fs.readFileSync('supabase/sql/20261005_store_baskets_recipe_v1.sql','utf8');
const categorySql=fs.readFileSync('supabase/sql/20261004_basket_category_required_v1.sql','utf8');
const publicRoot=fs.readFileSync('index.html','utf8');
const basketCarousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const publicVitrine=fs.readFileSync('vitrine/index.html','utf8');

const catalog=commerce.slice(commerce.indexOf('create or replace view public.basket_commercial_catalog_v1'),commerce.indexOf('create or replace view public.basket_current_lot_v1'));
assert.match(catalog,/from public\.basket_templates bt/i,'commercial catalog must remain based on basket_templates');
assert.doesNotMatch(catalog,/union all[\s\S]*from public\.basket_kit_templates k/i,'internal legacy kit templates must not become a second commercial entity');

// Legacy atomic creator remains for compatibility, while normal creation moves to recipe-based Cestas do Site.
assert.match(createSql,/create or replace function public\.create_basket_commercial_model_v1/i,'legacy atomic commercial creator must remain available');
assert.match(createSql,/insert into public\.basket_templates/i,'legacy creator must still create the commercial record');
assert.match(createSql,/revoke all on function public\.create_basket_commercial_model_v1[\s\S]*from public,anon,authenticated/i,'legacy creator must not be exposed to storefront users');
assert.match(storeSql,/create or replace function public\.save_store_basket_recipe_v1/i,'normal external basket creation must use recipe-based save');
assert.match(storeSql,/insert into public\.basket_templates/i,'recipe-based save must create the commercial basket');
assert.match(storeSql,/store_basket_recipe_kits/i,'external basket composition must be internal-kit based');
assert.doesNotMatch(storeSql,/insert\s+into\s+public\.basket_stock_lots/i,'saving external recipe must not create physical stock');
assert.match(categorySql,/basket_templates_category_required/i,'every commercial Cesta\/Kit must have a public category');
assert.match(categorySql,/check \(category_id is not null\)/i,'category constraint must reject uncategorized commercial models');

// Compatibility backend may keep the old action, but normal UI no longer calls it.
assert.match(backend,/"basket_commercial_create"/,'compatibility admin action must remain registered');
assert.match(backend,/create_basket_commercial_model_v1/,'compatibility backend must retain legacy creator');
assert.match(adminUi,/DonaAntoniaBasketAdmin\?\.render/,'admin runtime must delegate the Cestas/Kits page');
const configTabs=[...section.matchAll(/data-basket-config-tab="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(configTabs,['types','quantities','carousel','flow'],'Cestas must expose the four requested configuration tabs');
assert.doesNotMatch(section,/data-basket-advanced|data-basket-config-tab="(?:kits|store)"/,'legacy editors are not exposed as tabs in the new session');
assert.match(section,/COMPATIBILITY_MODULES/,'legacy operational routes stay internal to the compatibility adapter');
assert.doesNotMatch(section,/basket_commercial_create|openGuided|DonaAntoniaBasketGuided/,'normal section must not use legacy commercial/guided creation');
assert.match(storeUi,/Nova cesta/,'external basket workspace must expose one simple create action');
assert.match(storeUi,/admin-store-baskets-v1/,'external basket workspace must use isolated recipe API');
assert.match(storeUi,/Kits internos/,'external baskets must be composed from internal kits only');
assert.match(storeUi,/Valor oculto/,'external basket workspace must expose hidden adjustment');
assert.doesNotMatch(storeUi,/position_products|family_key|Adicionar termo/,'external basket workspace must not expose guided positions/families');
assert.match(guided,/Criar lote \/ reservar/,'technical guided lot creation remains available for compatibility');

assert.match(publicRoot,/Estamos preparando melhorias/,'public root is temporarily in maintenance');
assert.match(publicRoot,/https:\/\/wa\.me\/5565998150975/,'maintenance CTA points to WhatsApp');
assert.match(publicRoot,/noindex/,'maintenance page is not indexed');
assert.match(basketCarousel,/data-basket=/,'the basket carousel module keeps basket card actions available');
assert.match(publicVitrine,/<meta http-equiv="refresh" content="0;url=\/">/,'legacy /vitrine/ must redirect to the canonical root');
assert.match(publicVitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'legacy redirect must preserve query and hash');
assert.doesNotMatch(publicVitrine,/basket_categories|checkoutWhatsappUnified|submit_order/,'legacy /vitrine/ must not duplicate storefront or checkout behavior');

const promotionPath='supabase/migrations/20261005021000_basket_promote_legacy_standalone_kits_v1.sql';
assert.ok(fs.existsSync(promotionPath),'legacy standalone kits must be promoted into the unified commercial model');
const promotion=fs.readFileSync(promotionPath,'utf8');
assert.match(promotion,/basket_kit_templates[\s\S]*basket_id is null[\s\S]*category_id is not null/i,'promotion must target categorized standalone kit templates');
assert.match(promotion,/insert into public\.basket_templates/i,'promotion must create the single commercial Cesta\/Kit record');
assert.match(promotion,/update public\.basket_kit_templates[\s\S]*basket_id/i,'promotion must bind the existing internal kit template instead of duplicating its composition');
assert.match(promotion,/update public\.basket_stock_lots[\s\S]*basket_id/i,'existing draft and ready kit lots must follow the promoted commercial model');
assert.doesNotMatch(promotion,/insert into public\.basket_kit_template_items/i,'promotion must preserve existing kit composition without cloning items');

console.log('basket unified commercial model + two-layer UI: PASS');
