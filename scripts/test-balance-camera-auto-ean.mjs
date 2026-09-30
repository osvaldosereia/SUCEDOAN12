import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const image=fs.readFileSync('supabase/functions/product-image-openai-v1/index.ts','utf8');

function must(source,needle,label){
  if(!source.includes(needle))throw new Error(label+': missing '+needle);
}
function mustNot(source,needle,label){
  if(source.includes(needle))throw new Error(label+': forbidden '+needle);
}

for(const action of ['inventory_balance_resolve_ean','inventory_balance_prepare_unknown','inventory_balance_commit','inventory_balance_status'])must(edge,action,'edge action');
must(edge,'async function resolveInventoryBalanceEan','resolver');
must(edge,'purchase_xml_items','xml lookup');
must(edge,'product_fiscal_evidence','fiscal evidence');
must(edge,'ops2_catalog_baseline_items','bling baseline');
must(edge,'capture_inventory_unknown_ean_v1','unknown ean queue');
must(edge,'setProductStockOfficial','official stock path');
must(edge,'lot_selection_required','lot safety');
must(edge,'balance_auto_registration','auto registration source');
mustNot(edge,'inventory-product-research-v1','retired research');
mustNot(edge,'inventory-fast-balance-v3','retired balance');

for(const marker of ['Leitor EAN','Folhas A4','balanceCameraVideo','BarcodeDetector','balanceManualSearch','balanceGondola','balanceValidity','Salvar e próximo','Tirar foto do produto'])must(admin,marker,'admin mobile balance');
must(admin,"inventory_balance_resolve_ean",'admin resolver call');
must(admin,"inventory_balance_commit",'admin commit call');
must(admin,"getUserMedia",'camera lifecycle');
must(admin,"uploadProductImageSource",'photo upload reuse');
must(admin,"standardizeProductImage",'image standardization reuse');

must(image,'event==="identify"','image identify route');
must(image,'identifyProduct','image identify function');
must(image,'sales_category','image canonical category');
must(image,'fiscal fields are not inferred','no fiscal invention marker');

console.log('balance camera + auto EAN contract OK');
