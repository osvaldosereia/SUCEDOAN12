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
assert.match(ui,/data-mold-composition-count/);
for(const value of [1,2,3,4,5,6])assert.match(ui,new RegExp(`<option value=["']${value}["']`));
assert.match(ui,/data-mold-add-position/);
assert.match(ui,/data-mold-position-label/);
assert.match(ui,/data-mold-position-quantity/);
assert.match(ui,/data-mold-product-search/);
assert.match(ui,/data-mold-product-option/);
assert.match(ui,/data-mold-save/);
assert.equal(/kit interno|kit base|assembly_kit/i.test(ui),false,'normal mold editor must not teach internal kits');

// Preferred option is saved as position-option metadata and never requires a schema change.
assert.match(ui,/data-mold-prefer-option/);
assert.match(ui,/data-mold-selected-product/);
assert.match(ui,/preferred:o\.metadata\?\.preferred===true/);
assert.match(ui,/metadata:\{\.\.\.\(o\.metadata\|\|\{\}\),preferred:o\.preferred===true\}/);
assert.match(ui,/editar_produto/);
const adminHtml=fs.readFileSync('vitrine/admin/index.html','utf8');
assert.match(adminHtml,/params\.get\('editar_produto'\)/);
assert.match(adminHtml,/uuid\.test\(directProductId\)/);
assert.match(adminHtml,/openProductEditor\(\{id:directProductId\}\)/);
const compositionSQL=fs.readFileSync('supabase/migrations/20261013122000_basket_mold_preferred_product_v1.sql','utf8');
assert.match(compositionSQL,/metadata.*preferred/);
assert.match(compositionSQL,/bool_or\(s\.is_preferred\)/);
assert.match(compositionSQL,/when r\.has_preferred then 1/);
assert.match(compositionSQL,/preferred_in_stock/);
assert.match(compositionSQL,/available_stock/);

// Multiple preferences do not cancel one another; SQL distributes preferred SKUs.
assert.match(ui,/option\.preferred=option\.preferred!==true/);
assert.doesNotMatch(ui,/options\.forEach\(\(o,i\)=>\{o\.preferred=/);
assert.match(ui,/Marque quantos produtos preferenciais quiser/);
const multiPreferredSQL=fs.readFileSync('supabase/migrations/20261013164500_basket_mold_multi_preferred_v1.sql','utf8');
assert.match(multiPreferredSQL,/count\(\*\) filter \(where s\.is_preferred\)/);
assert.match(multiPreferredSQL,/\(\(sl\.composition_number - 1\) % r\.preferred_count\) \+ 1/);
assert.match(multiPreferredSQL,/when c\.is_preferred then 'preferred_in_stock'/);
assert.match(multiPreferredSQL,/where greatest\(0, coalesce\(s\.loose_sellable_stock/);
assert.match(section,/20261013-multi-preferred-v1/);

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


{
  // The running editor must never be replaced by a late response to a
  // previously selected basket or a product search for another position.
  const start=ui.indexOf('let moldEditorLoadGeneration=0;');
  const end=ui.indexOf('function selectConditionalProduct(',start);
  assert.ok(start>0&&end>start,'mold async controller isolation boundaries');
  const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
  const pending=new Map(),call=(action,params={})=>{
    const key=action+':'+String(params.basket_id??params.q??'');
    const d=deferred();pending.set(key,d);return d.promise;
  };
  const state={root:{querySelector:()=>null},draft:null,baskets:[],
    search:{},results:{},conditionalSearch:'',conditionalResults:[]};
  let paints=0;
  const {openBasket,searchProducts,searchConditionalProduct}=new Function(
    'state','call','normalizeEditor','render','toast','sync',
    ui.slice(start,end)+';return {openBasket,searchProducts,searchConditionalProduct};'
  )(state,call,value=>value,()=>paints++,error=>{throw Error(error)},()=>{});
  const older=openBasket('old'),newer=openBasket('new');
  pending.get('editor:new').resolve({editor:{basket_id:'new',positions:[{options:[]}]}});
  await newer;
  pending.get('editor:old').resolve({editor:{basket_id:'old',positions:[]}});
  await older;
  assert.equal(state.draft.basket_id,'new','late editor response must not replace the selected basket');
  assert.equal(paints,1);

  state.search[0]='first';
  const oldSearch=searchProducts(0);
  state.search[0]='second';
  const newSearch=searchProducts(0);
  pending.get('products:second').resolve({products:[{id:'recent'}]});
  await newSearch;
  pending.get('products:first').resolve({products:[{id:'stale'}]});
  await oldSearch;
  assert.deepEqual(state.results[0].map(x=>x.id),['recent'],'latest product query wins');

  state.search[0]='reindexed';
  const oldPosition=searchProducts(0);
  state.draft.positions[0]={options:[]};
  pending.get('products:reindexed').resolve({products:[{id:'wrong-position'}]});
  await oldPosition;
  assert.deepEqual(state.results[0].map(x=>x.id),['recent'],'removed position cannot be repainted');

  state.draft.conditional_hidden_enabled=true;
  state.conditionalSearch='conditional-first';
  const oldConditional=searchConditionalProduct();
  state.conditionalSearch='conditional-latest';
  const newConditional=searchConditionalProduct();
  pending.get('products:conditional-latest').resolve({products:[{id:'current'}]});
  await newConditional;
  pending.get('products:conditional-first').resolve({products:[{id:'stale'}]});
  await oldConditional;
  assert.deepEqual(state.conditionalResults.map(x=>x.id),['current'],'conditional picker ignores stale queries');
}


{
  // Saving a draft is durable, but an operator who selected another basket
  // before the request completes must not be redirected to the old editor.
  const start=ui.indexOf('async function save(){');
  const stop=ui.indexOf('function bind(){',start);
  assert.ok(start>0&&stop>start);
  let resolveSave,editors=0,lists=0;
  const messages=[];
  const draft={basket_id:'previous',category_id:'category',subcategory_id:'subcategory',
    name:'Cesta',public_composition_count:2,conditional_hidden_enabled:false,
    positions:[{label:'Produto',quantity:1,options:[{product_id:'sku'}]}]};
  const state={busy:false,draft};
  const controller=new Function('state','sync','call','render','loadList','openBasket','toast','operator',
    'let moldEditorLoadGeneration=0;'+ui.slice(start,stop)+
    ';return {save,navigate:()=>++moldEditorLoadGeneration};')(
      state,()=>{},action=>{
        assert.equal(action,'save');
        return new Promise(resolve=>resolveSave=resolve);
      },()=>{},async()=>{lists++;return true},async()=>{editors++},
      message=>messages.push(message),()=>'Teste');
  const submitted=controller.save();
  assert.equal(state.busy,true);
  controller.navigate();
  resolveSave({ok:true});
  await submitted;
  assert.equal(lists,0,'stale save must not refresh a different basket');
  assert.equal(editors,0,'stale save must not reopen the previous editor');
  assert.equal(state.busy,false);
  assert.ok(!messages.includes('Molde salvo.'),'old editor completion has no misleading success notice');
}

console.log('basket mold admin v1: PASS');
