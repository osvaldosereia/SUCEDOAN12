import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync('vitrine/admin/index.html','utf8');
const css=readFileSync('vitrine/admin/purchase-xml-simple.css','utf8');
const api=readFileSync('supabase/functions/purchase-xml-v1/index.ts','utf8');
function extract(name,next,asyncNext=false){
  const a=html.indexOf('  function '+name+'(');
  const b=html.indexOf(asyncNext?'  async function '+next+'(':'  function '+next+'(',a);
  assert.ok(a>=0&&b>a, 'found function: '+name);
  return html.slice(a,b);
}
const scripts=[...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
  .map(x=>x[1]).filter(Boolean);
for(const [index,script] of scripts.entries())
  assert.doesNotThrow(()=>new Function(script),'inline script '+index+' parses');
assert.match(html,/purchase-xml-simple\\.css\\?v=xml-r33/);
assert.doesNotMatch(html,/purchase-identity-ui-v1/,'obsolete conflicting identity controls removed');
assert.match(api,/bling_product_id,match_method,processing_status,metadata,created_at,products\\(/);
assert.match(api,/is_unlinked:isUnlinked/);
const loader=html.slice(html.indexOf('async function loadPurchases()'),html.indexOf('async function loadPurchaseAdvanced()'));
assert.doesNotMatch(loader,/purchaseApi\\('browse_bling'|purchaseApi\\('payment_accounts'|purchaseApi\\('catalog_queue'/);
assert.match(loader,/purchaseApi\\('summary'/);
assert.match(html,/purchaseAdvancedOpen/);
assert.match(html,/data-catalog-open-note/);
const cards=extract('purchaseItemCardHtml','purchaseXmlError');
assert.match(cards,/purchase-item-collapsible/);
assert.match(cards,/purchase-item-compact-summary/);
assert.match(cards,/<\\/details><\\/div>/);
assert.match(html,/catalog_evidence_only:true/,'invoice uses transactional identity API');
const queue=extract('purchaseCatalogCardHtml','openPurchaseCatalogNote',true);
assert.match(queue,/Sem vínculo/);
assert.match(queue,/Abrir NF-e/);
assert.doesNotMatch(queue,/data-catalog-approve/,'advanced index does not create separate save path');
const lots=extract('purchaseReceiptLotsHtml','bindPurchaseReceiptLots');
assert.match(lots,/Validade \\(opcional\\)/);
assert.match(lots,/data-receipt-lot-exp/);
assert.doesNotMatch(lots,/required/);
assert.match(css,/purchase-lot-row/);
assert.match(css,/purchase-item-compact-summary/);
assert.match(html,/data-receipt-lot-item/);
assert.match(api,/expiration_required:false/);
assert.match(api,/lot_expiration_date:exp\\|\\|null/);
console.log('PASS R33: JS parsing, lightweight initial load, safe identity linking, compact cards, optional lot expiration and single invoice editor');
