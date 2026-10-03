import assert from 'node:assert/strict';
import fs from 'node:fs';

const basePath='supabase/migrations/20261003201103_order_separation_v2.sql';
const completionPath='supabase/migrations/20261003201158_order_separation_v2_completion.sql';
assert.ok(fs.existsSync(basePath),`migration missing: ${basePath}`);
assert.ok(fs.existsSync(completionPath),`migration missing: ${completionPath}`);
const sql=fs.readFileSync(basePath,'utf8')+'\n'+fs.readFileSync(completionPath,'utf8');

for(const fn of [
  'ops2_prepare_order_separation_completion_v2',
  'ops2_apply_order_separation_stock_v2',
  'ops2_mark_order_separation_completion_v2'
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`${fn} must exist`);
}

const prepareStart=sql.toLowerCase().indexOf('create or replace function public.ops2_prepare_order_separation_completion_v2');
assert.ok(prepareStart>=0,'prepare completion function missing');
const prepare=sql.slice(prepareStart,sql.toLowerCase().indexOf('create or replace function public.ops2_apply_order_separation_stock_v2',prepareStart));
assert.match(prepare,/for\s+update/i,'completion preparation must lock the order');
assert.match(prepare,/state\s*=\s*'pending'|state\s+in\s*\([^)]*pending/i,'completion must reject pending items');
assert.match(prepare,/sum\s*\(\s*line_total\s*\)[\s\S]*state\s*=\s*'missing'|state\s*=\s*'missing'[\s\S]*sum\s*\(\s*line_total\s*\)/i,'missing subtotal must come from missing line totals');
assert.match(prepare,/v_final_total\s*:=\s*round\s*\(\s*v_original_total\s*-\s*v_missing_subtotal/i,'final total must subtract missing subtotal exactly once');
assert.match(prepare,/original_discount/i,'completion audit must preserve original discount');
assert.match(prepare,/original_other_expenses/i,'completion audit must preserve original other expenses');
assert.match(prepare,/original_basket_hidden_adjustment/i,'completion audit must preserve basket hidden adjustment');
assert.match(prepare,/deliverable_order_item_ids/i,'completion must persist deliverable line ids');
assert.match(prepare,/already_prepared|already_completed|on\s+conflict\s*\(\s*order_id\s*\)/i,'completion preparation must be idempotent');

const stockStart=sql.toLowerCase().indexOf('create or replace function public.ops2_apply_order_separation_stock_v2');
assert.ok(stockStart>=0,'partial stock function missing');
const stock=sql.slice(stockStart,sql.toLowerCase().indexOf('create or replace function public.ops2_mark_order_separation_completion_v2',stockStart));
assert.match(stock,/group\s+by\s+[\s\S]*product_id/i,'deliverable reservation quantity must aggregate duplicate product lines');
assert.match(stock,/vitrine_stock_reservations/i,'completion must update storefront reservations');
assert.match(stock,/status\s*=\s*'released'|status='released'/i,'zero-deliverable reservation must be released');
assert.match(stock,/status\s*=\s*'consumed'|status='consumed'/i,'deliverable reservation must be consumed operationally');
assert.match(stock,/basket_stock_allocations/i,'basket allocation must record missing component state');
assert.match(stock,/component_snapshot|missing_components/i,'basket allocation metadata/snapshot must preserve missing components');
assert.doesNotMatch(stock,/update\s+public\.products\s+set\s+stock/i,'Bling-authority separation completion must not change products.stock');
assert.match(stock,/physical_stock_changed[^\n]*false|jsonb_build_object\([\s\S]*'physical_stock_changed'\s*,\s*false/i,'partial stock operation must report no physical stock change');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_fiscal_dispatch_preflight_v1\s*\(/i,'migration must replace fiscal dispatch preflight canonically');
const preflightStart=sql.toLowerCase().lastIndexOf('create or replace function public.ops2_fiscal_dispatch_preflight_v1');
const preflight=sql.slice(preflightStart);
assert.match(preflight,/order_separation_completions_v1/i,'preflight must detect completed separation');
assert.match(preflight,/order_separation_items_v1/i,'preflight must sum deliverable separated lines');
assert.match(preflight,/state\s*=\s*'separated'|state='separated'/i,'preflight item sum must exclude missing lines');
assert.match(preflight,/fiscal_subtotal_item_sum_mismatch/i,'existing fiscal subtotal guard must remain');
assert.match(preflight,/canonical_total_not_balanced/i,'existing canonical total balance guard must remain');

assert.match(prepare,/v_new_subtotal\s*:=\s*round\s*\(\s*v_original_subtotal\s*-\s*v_missing_subtotal/i,'canonical subtotal must fall by missing subtotal');
assert.match(prepare,/v_new_fiscal_subtotal\s*:=\s*round\s*\(\s*v_original_fiscal_subtotal\s*-\s*v_missing_subtotal/i,'fiscal subtotal must fall by missing subtotal');
assert.doesNotMatch(prepare,/\bdiscount\s*=\s*[^,;]+/i,'completion must not repurpose commercial discount');
assert.doesNotMatch(prepare,/\bother_expenses\s*=\s*[^,;]+/i,'completion must not overwrite other expenses');
assert.doesNotMatch(prepare,/\bbasket_hidden_adjustment\s*=\s*[^,;]+/i,'completion must not overwrite basket hidden adjustment');

console.log('OK · separation v2 completion financial/stock contract');
