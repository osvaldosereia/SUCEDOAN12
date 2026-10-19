import fs from 'node:fs';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const runtime=fs.readFileSync('vitrine/admin/runtime-parts/06-baskets-products.part.js','utf8');
const quickSave=fs.readFileSync('vitrine/admin/products/mobile-quick-save.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const productView=fs.readFileSync('vitrine/admin/products/list-view.js','utf8');
const productList=runtime.slice(runtime.indexOf('function watchNextProducts'),runtime.indexOf('async function loadProducts'));
const productLoad=runtime.slice(runtime.indexOf('async function loadProducts'),runtime.indexOf('function paintProductCategories'));
const checks=[
 ['grid mobile 2 colunas',html.includes('.mobile-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))')],
 ['cards sem lotes pendentes',productView.includes('function mobileCard(p)')&&!productView.includes('Lotes pendentes')&&!productView.includes('FEFO completo')],
 ['switch profissional',productView.includes('mobile-product-switch')&&productView.includes('data-mobile-product-active')],
 ['edicao rapida',productView.includes('data-mobile-product-field="price"')&&productView.includes('data-mobile-product-field="stock"')&&productView.includes('data-mobile-product-field="gondola"')&&productView.includes('data-mobile-product-field="expiration"')],
 ['autosave debounce',quickSave.includes('timers.set(()=>flush(id),650)')],
 ['fila estoque',runtime.includes('async function processMobileProductStockQueue()')],
 ['fila serializa saves por produto',quickSave.includes('if(busy.has(id))return')&&quickSave.includes('busy.add(id)')&&quickSave.includes('busy.delete(id)')],
 ['lista desktop 5 e mobile 6',productList.includes('const limit=mobile?6:5;')&&productLoad.includes('const mobile=isProductsMobile(),offset=append?state.productNext:0,limit=mobile?6:5;')],
 ['sort enviado backend',productLoad.includes('sort,offset,limit')],
 ['ordenacoes',runtime.includes('updated_desc')&&runtime.includes('updated_asc')&&runtime.includes('expiry_asc')&&runtime.includes('gondola_asc')&&runtime.includes('name_desc')],
 ['backend quick save',edge.includes('async function quickProductSave(')&&edge.includes('a==="product_quick_save"')],
 ['backend sort',edge.includes('productSortKey(u.searchParams.get("sort"))')&&edge.includes('gondola_desc')]
];
let fail=0;for(const [n,ok] of checks){if(ok)console.log('OK',n);else{console.error('FAIL',n);fail++}}if(fail)process.exit(1);
