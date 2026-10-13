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
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).filter(Boolean);
for(const [index,script] of scripts.entries())
  assert.doesNotThrow(()=>new Function(script),'inline script '+index+' parses');
assert.match(html,/purchase-xml-simple\.css\?v=xml-r33/);
assert.doesNotMatch(html,/purchase-identity-ui-v1/,'obsolete conflicting identity controls removed');
assert.match(api,/bling_product_id,match_method,processing_status,metadata,created_at,products\(/);
assert.match(api,/is_unlinked:isUnlinked/);
const loader=html.slice(html.indexOf('async function loadPurchases()'),html.indexOf('async function loadPurchaseAdvanced()'));
assert.doesNotMatch(loader,/purchaseApi\('browse_bling'|purchaseApi\('payment_accounts'|purchaseApi\('catalog_queue'/);
assert.match(loader,/purchaseApi\('summary'/);
assert.match(html,/purchaseAdvancedOpen/);
assert.match(html,/data-catalog-open-note/);
const cards=extract('purchaseItemCardHtml','purchaseXmlError');
assert.match(cards,/purchase-item-collapsible/);
assert.match(cards,/purchase-item-compact-summary/);
assert.match(cards,/<\/details><\/div>/);
assert.match(html,/catalog_evidence_only:true/,'invoice uses transactional identity API');
const queue=extract('purchaseCatalogCardHtml','openPurchaseCatalogNote',true);
assert.match(queue,/Sem vínculo/);
assert.match(queue,/Abrir NF-e/);
assert.doesNotMatch(queue,/data-catalog-approve/,'advanced index does not create separate save path');
const lots=extract('purchaseReceiptLotsHtml','bindPurchaseReceiptLots');
assert.match(lots,/Validade \(opcional\)/);
assert.match(lots,/data-receipt-lot-exp/);
assert.doesNotMatch(lots,/required/);
assert.match(css,/purchase-lot-row/);
assert.match(css,/purchase-item-compact-summary/);
assert.match(html,/data-receipt-lot-item/);
assert.match(api,/expiration_required:false/);
assert.match(api,/lot_expiration_date:exp\|\|null/);

// Navigation regression: a note found in the 31-day index must open even when
// its date is outside the current filter. Do not regress to a double-escaped ISO regex.
{
  const a=html.indexOf('  async function openPurchaseCatalogNote(');
  const b=html.indexOf('  function purchaseCatalogListHtml(',a);
  assert.ok(a>0&&b>a,'catalog note navigation is defined');
  const code=html.slice(a,b);
  const state={purchaseCatalogQueue:{items:[{document_id:'nf-1',document:{issued_at:'2026-10-08T12:00:00'}}]},purchaseXml:{documents:[]}};
  let refresh=0,opened=false;
  const nav=new Function('state','loadPurchases','paintPurchases','togglePurchaseDocument','document','CSS','toast',code+'return openPurchaseCatalogNote;')(
    state,async()=>{refresh++;state.purchaseXml.documents=[{id:'nf-1'}]},()=>{},
    async id=>{opened=id==='nf-1'}, {querySelector:()=>({scrollIntoView(){}})},
    {escape:x=>x},msg=>{throw new Error('Navigation blocked: '+msg)}
  );
  await nav('nf-1');
  assert.equal(refresh,1,'index link fetches invoice date when necessary');
  assert.equal(state.purchaseFilter.start_date,'2026-10-08');
  assert.equal(state.purchaseFilter.end_date,'2026-10-08');
  assert.equal(opened,true,'invoice opens after setting the date filter');
}
// Advanced index and Bling comparison have independent loading paths.
{
  const start=html.indexOf('  async function loadPurchaseAdvanced()');
  const comparison=html.indexOf('  async function loadPurchaseBlingComparison()',start);
  const stop=html.indexOf('  function purchaseMaybeMoney(',comparison);
  assert.ok(start>0&&comparison>start&&stop>comparison);
  const advanced=html.slice(start,comparison);
  const bling=html.slice(comparison,stop);
  assert.match(advanced,/purchaseApi\\('catalog_queue'/);
  assert.doesNotMatch(advanced,/browse_bling|payment_accounts/);
  assert.match(bling,/purchaseApi\\('browse_bling'/);
  let calls=[];
  const state={purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false,
    purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false};
  const load=new Function('state','purchaseApi','$','paintPurchases','purchaseXmlError',
    advanced+bling+'return {loadPurchaseAdvanced,loadPurchaseBlingComparison};')(
      state,async (action)=>{calls.push(action);return {ok:true,items:[],documents:[]}},
      ()=>null,()=>{},String
    );
  await load.loadPurchaseAdvanced();
  assert.deepEqual(calls,['catalog_queue'],'expanding the index must not query Bling');
  await load.loadPurchaseBlingComparison();
  assert.deepEqual(calls,['catalog_queue','browse_bling'],'Bling loads only after explicit comparison');
}

console.log('PASS R33: JS parsing, lightweight initial load, safe identity linking, compact cards, optional lot expiration and single invoice editor');
