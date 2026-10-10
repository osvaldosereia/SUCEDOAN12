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
assert.match(ui,/Aprovação em massa de custo\/preço desativada/,'unsafe bulk repricing disabled');
console.log('PASS R2: UI name, price and cost safeguards');

assert.match(ui,/id="xmlDetailNewName"[^>]*value="" placeholder="Nome comercial por unidade/,'new commercial name must be manually entered');
assert.match(ui,/if\(createNew&&\/\^\(\?:CX/,'packaging prefix must be rejected for new name');
console.log('PASS R2: new product name is not prefilled from supplier XML');
