import fs from 'node:fs';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const mobileStart=html.indexOf('function productMobileCard(p)');
const mobileEnd=html.indexOf('function scheduleMobileProductQuickSave',mobileStart);
const mobileCard=mobileStart>=0&&mobileEnd>mobileStart?html.slice(mobileStart,mobileEnd):'';
const checks=[
 ['grid mobile 2 colunas',html.includes('.mobile-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))')],
 ['cards sem lotes pendentes',mobileCard.includes('function productMobileCard(p)')&&!mobileCard.includes('Lotes pendentes')&&!mobileCard.includes('FEFO completo')],
 ['switch profissional',html.includes('mobile-product-switch')&&html.includes('data-mobile-product-active')],
 ['edicao rapida',html.includes('data-mobile-product-field="price"')&&html.includes('data-mobile-product-field="stock"')&&html.includes('data-mobile-product-field="gondola"')&&html.includes('data-mobile-product-field="expiration"')],
 ['autosave debounce',html.includes('setTimeout(()=>flushMobileProductQuickSave(id),650)')],
 ['fila estoque',html.includes('async function processMobileProductStockQueue()')],
 ['produtos 5 por vez',html.includes("const limit=5;")],
 ['sort enviado backend',html.includes('sort:state.productSort||\'\'')],
 ['ordenacoes',html.includes('updated_desc')&&html.includes('updated_asc')&&html.includes('expiry_asc')&&html.includes('gondola_asc')&&html.includes('name_desc')],
 ['backend quick save',edge.includes('async function quickProductSave(')&&edge.includes('a==="product_quick_save"')],
 ['backend sort',edge.includes('productSortKey(u.searchParams.get("sort"))')&&edge.includes('gondola_desc')]
];
let fail=0;for(const [n,ok] of checks){if(ok)console.log('OK',n);else{console.error('FAIL',n);fail++}}if(fail)process.exit(1);
