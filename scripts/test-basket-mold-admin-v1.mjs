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
assert.match(ui,/public_composition_count:1/);
assert.match(ui,/data-mold-add-position/);
assert.match(ui,/data-mold-position-label/);
assert.match(ui,/data-mold-position-quantity/);
assert.match(ui,/data-mold-product-search/);
assert.match(ui,/data-mold-product-option/);
assert.match(ui,/data-mold-save/);
assert.equal(/kit interno|kit base|assembly_kit/i.test(ui),false,'normal mold editor must not teach internal kits');

// Preferred option is saved as position-option metadata and never requires a schema change.
assert.doesNotMatch(ui,/data-mold-prefer-option/);
assert.match(ui,/data-mold-selected-product/);
assert.match(ui,/preferred:o\.metadata\?\.preferred===true/);
assert.match(ui,/metadata:\{\.\.\.\(o\.metadata\|\|\{\}\)\}/);
assert.match(ui,/editar_produto/);
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
assert.match(section,/20261019-basket-personalization-v1/);
assert.match(section,/Produtos adicionais/);

// Gateway forwards the logged-in admin JWT and never loads a privileged server key.
assert.match(api,/SUPABASE_ANON_KEY/);
assert.equal(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/.test(api),false,'mold gateway must not load privileged database secrets');
assert.match(api,/Authorization/);
assert.match(api,/const MUTATIONS=new Set\(\[[^\]]*["']save["']/s);
for(const action of ['list','editor','products','save'])assert.match(api,new RegExp(`action===?["']${action}["']`));
for(const rpc of ['admin_basket_mold_list_v1','admin_basket_mold_editor_v1','admin_basket_mold_products_v1','admin_save_basket_mold_v3'])assert.match(api,new RegExp(rpc));

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

console.log('basket mold admin v1: PASS');

