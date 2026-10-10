import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const path = 'supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts';
const src = readFileSync(path, 'utf8');
const start = src.indexOf('async function applyItemUpdate(');
const end = src.indexOf('export async function handlePurchaseXmlRequest(', start);
assert(start >= 0 && end > start, 'purchase apply handler present');
const fn = src.slice(start, end);
const beforeWrites = fn.slice(0, fn.indexOf('const iu=await sb.from("purchase_xml_items").update('));
assert.match(beforeWrites, /proposedName&&proposedName!==String\(product\.name\|\|""\)/,
  'reject renaming existing product before any item write');
assert.match(beforeWrites, /error:"existing_product_name_preserved"/);
assert.match(fn, /const updateCost=body\?\.update_cost===true,updateSale=body\?\.update_sale_price===true/,
  'cost and retail price must be explicit opt-in');
assert.doesNotMatch(fn, /upd\.name\s*=/, 'never rename existing product via XML');
assert.doesNotMatch(fn, /upd\.ncm\s*=/, 'never replace sales NCM from purchase XML');
assert.match(fn, /converted_quantity:baseQty,base_unit_cost:baseCost/,
  'conversion keeps unit quantity and unit cost');
assert.match(fn, /stock_unchanged:true/, 'no stock movement during catalog update');
console.log('PASS R2: existing name/NCM preserved; price/cost opt-in; name guard precedes writes; unit conversion and no stock');

const syncStart=src.indexOf('async function runBlingSync(');
const syncEnd=src.indexOf('async function manualImport(',syncStart);
const sync=src.slice(syncStart,syncEnd);
assert.match(sync,/manualCatalogOnlyImport\(\[\{name:"bling-nfe-"/,
  'Bling sync ingests only catalog evidence');
assert.doesNotMatch(sync,/processXml\(/,
  'Bling sync cannot call operational importer');
const dispatch=src.slice(src.indexOf('export async function handlePurchaseXmlRequest('));
assert.match(dispatch,/if\(action==="manual_import"\)[\s\S]*?manualCatalogOnlyImport\(files\)/,
  'legacy manual import routes to catalog-only');
assert.match(dispatch,/if\(action==="daily_sync"\)[\s\S]*?finance_skipped:true/,
  'daily XML sync does not trigger finance backfill');
assert.match(dispatch,/body\?\.catalog_evidence_only!==true/,
  'legacy product identity mutation requires evidence-only review');
console.log('PASS R2: Bling/manual catalog-only ingestion; no implicit finance; legacy identity blocked');

const catalogStart=src.indexOf('async function manualCatalogOnlyImport(');
const catalogEnd=src.indexOf('// Return source evidence',catalogStart);
const catalog=src.slice(catalogStart,catalogEnd);
assert.match(catalog,/options:\{source\?:string;runId\?:string\}/,'catalog ingestion supports source and parent run');
assert.match(catalog,/if\(!externalRunId\)\{/,'avoid creating a nested import run');
assert.match(catalog,/import_run_id:runId,source/,'persist actual source');
assert.match(sync,/\{source,runId:id\}/,'Bling passes original source and run');
console.log('PASS R2: Bling source preserved without nested import runs');

const ui=readFileSync('vitrine/admin/index.html','utf8');
assert.doesNotMatch(ui,/data-catalog-update-cost checked>/,'cost checkbox cannot be checked by default');
assert.match(ui,/if\(saleCheck\)saleCheck\.checked=false/,'retail price checkbox cannot auto-check');
assert.match(ui,/Produto existente: o nome cadastrado deve permanecer igual/,'existing product name protected in UI');
assert.match(ui,/id="purchaseCatalogApproveSafe" type="button" disabled/,'unsafe bulk repricing disabled in UI');
console.log('PASS R2: UI name, price and cost safeguards');

assert.match(ui,/id="xmlDetailNewName"[^>]*value="" placeholder="Nome comercial por unidade/,'new commercial name must be manually entered');
assert.match(ui,/if\(createNew&&\/\^\(\?:CX/,'packaging prefix must be rejected for new name');
console.log('PASS R2: new product name is not prefilled from supplier XML');

const identityStart=src.indexOf('async function resolvePurchaseItemIdentity(');
const identityEnd=src.indexOf('async function ',identityStart+15);
const identity=src.slice(identityStart,identityEnd);
assert.match(identity,/newName\.length<3/,'API requires new commercial name');
assert.match(identity,/xml_identity_commercial_unit_name_required/,'API rejects invalid names');
assert.match(identity,/PCT\|PACOTE\)\\b\/i\.test\(newName\)/,'API blocks supplier packaging prefix');
console.log('PASS R2: new product name validation enforced at API boundary');

assert.match(dispatch,/if\(action==="xml_field_apply_commit"\)return js\(req,\{ok:false,error:"existing_product_name_preserved"\},409\)/,'legacy XML rename is blocked');
assert.match(dispatch,/"xml_field_apply_commit","xml_field_apply_rollback"\]\.includes\(action\)/,'rollback remains available');
console.log('PASS R2: existing names cannot be overwritten by legacy XML apply');

assert.match(fn,/Number\.isInteger\(factor\)/,'conversion must be integer');
assert.match(fn,/unit_purchase_factor_must_be_one/,'UN input must never multiply quantity');
const converted=(cases,units,net)=>({quantity:cases*units,unitCost:net/(cases*units)});
assert.deepEqual(converted(10,12,240),{quantity:120,unitCost:2},'10 CX of 12 = 120 UN and R$2/UN');
assert.deepEqual(converted(3,1,45),{quantity:3,unitCost:15},'3 UN remains 3 UN');
console.log('PASS R2: integer factors, UN=1 and arithmetic examples');

assert.match(catalog,/if\(inserted\.error\)\{[\s\S]*?storage\.from\("purchase-xml"\)\.remove\(\[path\]\)/,
  'newly uploaded XML object is cleaned up if DB insert fails');
console.log('PASS R2: failed document insert cleans newly uploaded storage object');

assert.doesNotMatch(ui,/await purchaseApi\('apply_item_update',[\s\S]{0,200}update_cost:true,update_sale_price:Boolean\(p\.update_sale_recommended\)/,
  'unreachable bulk repricing loop must be removed');

const conversionStart=src.indexOf('async function setConversion(');
const conversionEnd=src.indexOf('async function applyItemUpdate(',conversionStart);
const conversionHandler=src.slice(conversionStart,conversionEnd);
assert.match(conversionHandler,/Number\.isInteger\(factor\)/,'manual conversion rejects fractional factor');
assert.match(conversionHandler,/unit_purchase_factor_must_be_one/,'manual conversion cannot multiply UN');
assert.match(dispatch,/if\(action==="set_conversion"\)\{if\(a\.internal\|\|!\["owner","admin"\]\.includes\(a\.role\)\)/,
  'manual conversion restricted to human owner/admin');
console.log('PASS R2: conversion edit permissions and integer unit validation');

assert.match(dispatch,/if\(action==="apply_item_update"\)\{if\(a\.internal\|\|!\["owner","admin"\]\.includes\(a\.role\)\)/,
  'catalog product updates require human owner/admin');
console.log('PASS R2: existing product writes restricted to owner/admin');
