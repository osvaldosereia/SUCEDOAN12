import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_basket_commercial_model_save_v2.sql';
const migrationPath='supabase/migrations/20261005114000_basket_commercial_model_save_v2.sql';
const apiPath='supabase/functions/admin-basket-guided-v1/index.ts';
const uiPath='vitrine/admin/basket-guided-builder.js';

assert.equal(fs.existsSync(sqlPath),true,'commercial model save v2 SQL must exist');
assert.equal(fs.existsSync(migrationPath),true,'commercial model save v2 migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');

for(const text of [sql,migration]){
  assert.match(text,/save_basket_commercial_model_v2/i,'must define save_basket_commercial_model_v2');
  assert.match(text,/update\s+public\.basket_templates[\s\S]*name\s*=|set[\s\S]*name\s*=/i,'must update commercial name');
  assert.match(text,/category_id/i,'must update category');
  assert.match(text,/base_price/i,'must update sale price');
  assert.match(text,/image_url/i,'must update image');
  assert.match(text,/save_basket_commercial_model_composition_v1/i,'must keep composition validation in the canonical composition function');
  assert.match(text,/update\s+public\.basket_kit_templates[\s\S]*name\s*=/i,'must keep internal kit name aligned');
  assert.match(text,/revoke\s+all[\s\S]*public,anon,authenticated/i,'must revoke direct client execution');
  assert.match(text,/grant\s+execute[\s\S]*service_role/i,'must grant only service role');
}

assert.match(api,/save_basket_commercial_model_v2/,'guided API model_save must call commercial model v2 RPC');
assert.doesNotMatch(api,/modelSave[\s\S]{0,900}save_basket_commercial_model_composition_v1/,'guided API must not bypass the v2 commercial save');
assert.match(api,/basket_categories/,'model editor must provide active commercial categories');
for(const field of ['name','category_id','base_price','image_url'])assert.match(api,new RegExp(`p_${field}|${field}`),`guided API must pass ${field}`);

for(const id of ['bgCommercialName','bgCommercialCategory','bgCommercialPrice','bgCommercialImage'])assert.match(ui,new RegExp(id),`guided UI must render ${id}`);
assert.match(ui,/syncCommercialForm/,'guided UI must sync commercial fields before saving');
assert.match(ui,/commercial:/,'guided UI must send commercial data in model_save');

console.log('basket commercial model edit v2: PASS');
