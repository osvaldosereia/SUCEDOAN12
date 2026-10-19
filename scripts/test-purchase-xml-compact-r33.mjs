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
  const start=html.indexOf('  let purchaseAdvancedGeneration=0;');
  const comparison=html.indexOf('  async function loadPurchaseBlingComparison()',start);
  const stop=html.indexOf('  function purchaseMaybeMoney(',comparison);
  assert.ok(start>0&&comparison>start&&stop>comparison);
  const advanced=html.slice(start,comparison);
  const bling=html.slice(comparison,stop);
  assert.ok(advanced.includes("purchaseApi('catalog_queue'"),'catalog queue loads only when expanded');
  assert.doesNotMatch(advanced,/browse_bling|payment_accounts/);
  assert.ok(bling.includes("purchaseApi('browse_bling'"),'Bling comparison is on demand');
  let calls=[];
  const state={purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false,
    purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false};
  const load=new Function('state','purchaseApi','$','paintPurchases','purchaseXmlError','purchaseFilterPayload',
    advanced+bling+'return {loadPurchaseAdvanced,loadPurchaseBlingComparison};')(
      state,async (action)=>{calls.push(action);return {ok:true,items:[],documents:[]}},
      ()=>null,()=>{},String,()=>({period:'this_month'})
    );
  await load.loadPurchaseAdvanced();
  assert.deepEqual(calls,['catalog_queue'],'expanding the index must not query Bling');
  await load.loadPurchaseBlingComparison();
  assert.deepEqual(calls,['catalog_queue','browse_bling'],'Bling loads only after explicit comparison');
}


{
  // Switching periods while a Bling comparison is pending must not leave the
  // spinner locked or let the old period overwrite the new result.
  const begin=html.indexOf('  let purchasesLoadGeneration=0;');
  const advancedStart=html.indexOf('  let purchaseAdvancedGeneration=0;',begin);
  const compareStart=html.indexOf('  async function loadPurchaseBlingComparison()',advancedStart);
  const stop=html.indexOf('  function purchaseMaybeMoney(',compareStart);
  assert.ok(begin>0&&advancedStart>begin&&compareStart>advancedStart&&stop>compareStart);
  const host={innerHTML:''},pending=[];
  const state={
    tab:'purchases',purchaseFilter:{period:'old'},
    purchaseAdvancedOpen:false,purchaseBlingCompareOpen:false,
    purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false,
    purchaseBlingCompareKey:'',purchaseBlingReceivedReview:{ok:false}
  };
  const purchaseApi=async(action)=>{
    if(action==='summary')return {documents:[]};
    if(action==='bling_received_review_status')return {ok:true};
    if(action==='browse_bling')return new Promise(resolve=>pending.push(resolve));
    throw new Error('Unexpected API action: '+action);
  };
  const {loadPurchases,loadPurchaseBlingComparison}=new Function(
    'state','$','purchaseCustomRangeReady','esc','purchasePeriodLabel',
    'purchaseFilterPayload','purchaseApi','paintBlingReceivedReview',
    'paintPurchases','queueMicrotask','purchaseXmlError',
    html.slice(begin,stop)+';return {loadPurchases,loadPurchaseBlingComparison};'
  )(state,key=>key==='#purchaseBody'?host:null,()=>true,String,()=>state.purchaseFilter.period,
    ()=>({...state.purchaseFilter}),purchaseApi,()=>{},()=>{},queueMicrotask,String);
  await loadPurchases();
  const old=loadPurchaseBlingComparison();
  assert.equal(pending.length,1);
  state.purchaseFilter.period='new';
  state.purchaseBlingCompareOpen=true;
  await loadPurchases();
  assert.equal(pending.length,2,'changing filters starts a new comparison even when the old request is pending');
  pending[0]({documents:[{id:'stale'}]});
  await old;
  assert.equal(state.purchaseBlingCompareLoading,true,'stale completion must not stop the current request spinner');
  pending[1]({documents:[{id:'current'}]});
  await Promise.resolve();
  assert.equal(state.purchaseBlingBrowse.documents[0].id,'current');
  assert.equal(state.purchaseBlingCompareLoaded,true);
  assert.equal(state.purchaseBlingCompareLoading,false);
}

console.log('PASS R33: JS parsing, lightweight initial load, safe identity linking, compact cards, optional lot expiration and single invoice editor');
