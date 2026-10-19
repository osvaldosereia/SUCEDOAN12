import fs from 'node:fs';
import assert from 'node:assert/strict';

const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const uiPath='vitrine/admin/basket-mold-admin.js';
const apiPath='supabase/functions/admin-basket-molds-v1/index.ts';
const sqlPath='supabase/sql/20261006_basket_mold_admin_v1.sql';

assert.equal(fs.existsSync(uiPath),true,'simplified basket mold admin module must exist');
assert.equal(fs.existsSync(apiPath),true,'basket mold admin gateway must exist');
assert.equal(fs.existsSync(sqlPath),true,'basket mold admin SQL must exist');

const ui=fs.readFileSync(uiPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const sql=fs.readFileSync(sqlPath,'utf8');

// Cestas Molde is the day-to-day default. Internal kit tools stay advanced.
assert.match(section,/molds:\s*\{[^}]*label:'Cestas Molde'/s);
assert.match(section,/const state=\{tab:'molds'/);
assert.match(section,/data-basket-advanced/i);
assert.match(section,/Ferramentas avançadas/i);
assert.match(section,/DonaAntoniaBasketMolds/);

// Simplified editor exposes only business concepts.
assert.match(ui,/data-mold-name/);
assert.match(ui,/data-mold-hidden-adjustment/);
assert.doesNotMatch(ui,/data-mold-composition-count/);
assert.match(ui,/public_composition_count:d.public_composition_count/);
assert.match(ui,/Math.min\(6,Math.max\(1,Number\(e\?\.public_composition_count\|\|1\)\)\)/);
assert.match(ui,/Cestas e quantidades/);
assert.match(ui,/Produtos e marcas/);
assert.match(ui,/data-mold-shared-search/);
assert.match(ui,/data-mold-shared-add/);
assert.match(ui,/data-mold-shared-remove/);
assert.match(ui,/data-mold-position-quantity/);
assert.match(ui,/positions:activePositions\.map/);
assert.match(ui,/Quantidade \(0 remove\)/);
assert.match(ui,/data-mold-save/);
assert.equal(/kit interno|kit base|assembly_kit/i.test(ui),false,'normal mold editor must not teach internal kits');

const adminHtml=fs.readFileSync('vitrine/admin/index.html','utf8');
assert.match(adminHtml,/basket-admin-section\.js\?v=basket-personalization-v1/);
const compositionSQL=fs.readFileSync('supabase/migrations/20261013122000_basket_mold_preferred_product_v1.sql','utf8');
assert.match(compositionSQL,/metadata.*preferred/);
assert.match(compositionSQL,/bool_or\(s\.is_preferred\)/);
assert.match(compositionSQL,/when r\.has_preferred then 1/);
assert.match(compositionSQL,/preferred_in_stock/);
assert.match(compositionSQL,/available_stock/);

// Multiple preferences do not cancel one another; SQL distributes preferred SKUs.
assert.doesNotMatch(ui,/options\.forEach\(\(o,i\)=>\{o\.preferred=/);
assert.match(ui,/até 3 marcas/i);
const multiPreferredSQL=fs.readFileSync('supabase/migrations/20261013164500_basket_mold_multi_preferred_v1.sql','utf8');
assert.match(multiPreferredSQL,/count\(\*\) filter \(where s\.is_preferred\)/);
assert.match(multiPreferredSQL,/\(\(sl\.composition_number - 1\) % r\.preferred_count\) \+ 1/);
assert.match(multiPreferredSQL,/when c\.is_preferred then 'preferred_in_stock'/);
assert.match(multiPreferredSQL,/where greatest\(0, coalesce\(s\.loose_sellable_stock/);
assert.match(section,/20261019-shared-brands-v2/);
assert.match(section,/Produtos adicionais/);

// Gateway forwards the logged-in admin JWT and never loads a privileged server key.
assert.match(api,/SUPABASE_ANON_KEY/);
assert.equal(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/.test(api),false,'mold gateway must not load privileged database secrets');
assert.match(api,/Authorization/);
assert.match(api,/const MUTATIONS=new Set\(\[[^\]]*["']save["']/s);
for(const action of ['list','editor','products','shared_items','shared_items_save','save'])assert.match(api,new RegExp(`action===?["']${action}["']`));
for(const rpc of ['admin_basket_mold_list_v1','admin_basket_mold_editor_v1','admin_basket_mold_products_v1','admin_basket_mold_shared_items_v1','admin_save_basket_mold_shared_items_v1','admin_save_basket_mold_v3'])assert.match(api,new RegExp(rpc));

// Public wrappers are SECURITY DEFINER but authorize auth.uid() against admin_users before touching protected tables.
for(const fn of ['admin_basket_mold_list_v1','admin_basket_mold_editor_v1','admin_basket_mold_products_v1','admin_save_basket_mold_v1'])assert.match(sql,new RegExp(`create or replace function public\\.${fn}\\s*\\(`,'i'));
assert.match(sql,/security definer/i);
assert.match(sql,/auth\.uid\s*\(\s*\)/i);
assert.match(sql,/public\.admin_users/i);
assert.match(sql,/is_active\s*=\s*true/i);
assert.match(sql,/role\s*<>\s*'viewer'/i);
assert.match(sql,/p_name\s+text/i);
assert.match(sql,/update public\.basket_templates[\s\S]*set name\s*=\s*v_name/i);
assert.match(sql,/public\.save_basket_mold_v1\s*\(/i);
assert.match(sql,/public\.ops2_loose_sellable_stock_v1/i);
assert.match(sql,/revoke all on function public\.admin_save_basket_mold_v1\([^;]+from public,\s*anon/is);
assert.match(sql,/grant execute on function public\.admin_save_basket_mold_v1\([^;]+to authenticated/is);

const sharedSQL=fs.readFileSync('supabase/migrations/20261019180000_basket_mold_shared_brands_v1.sql','utf8');
assert.match(sharedSQL,/basket_mold_shared_items/);
assert.match(sharedSQL,/admin_save_basket_mold_shared_items_v1/);
assert.match(sharedSQL,/row_number\(\) over \(partition by i\.id order by c\.price/);
assert.match(sharedSQL,/option_order<=3/);
assert.match(ui,/Quantidade \(0 remove\)/);
const completeSQL=fs.readFileSync('supabase/migrations/20261019190000_basket_mold_shared_brands_all_sizes_and_price_v2.sql','utf8');
assert.match(completeSQL,/basket_shared_registry_incomplete/);
assert.match(completeSQL,/lowest_price_in_stock/);
console.log('basket mold admin shared brands v2: PASS');

