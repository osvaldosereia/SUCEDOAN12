import assert from 'node:assert/strict';
import fs from 'node:fs';
const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts','utf8');
const style=fs.readFileSync('vitrine/admin/purchase-xml-simple.css','utf8');
const section=(start,end)=>admin.slice(admin.indexOf(start),admin.indexOf(end,start.length+admin.indexOf(start)));
function must(s,needle){assert.ok(s.includes(needle),'Missing contract: '+needle)}

// Syntax of all inline browser scripts (including the main Admin bundle)
const scripts=[...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).filter(Boolean);
scripts.forEach((source,i)=>{try{new Function(source)}catch(e){throw Error('Inline script '+(i+1)+': '+e.message)}});
console.log('Inline Admin JavaScript syntax OK: '+scripts.length+' scripts.');

const runtimeSection=(start,end)=>runtime.slice(runtime.indexOf(start),runtime.indexOf(end,runtime.indexOf(start)+start.length));
const note=runtimeSection('function renderPurchaseDocumentInline(id,data){','async function togglePurchaseDocument(');
const card=runtimeSection('function purchaseItemCardHtml(x){','function purchaseXmlError(e){');
const matcher=runtimeSection('async function purchaseConfirmMatch(card,createNew=false){','function recalcPurchaseItemCard(');
const apply=runtimeSection('async function applyPurchaseItemUpdate(itemId,quiet=false){','async function approveReadyPurchaseItems(');
const backend=section('not-used','unused'); // Explicitly use api for service contracts below.
assert.ok(note.length>200&&card.length>400&&matcher.length>200&&apply.length>100);
for(const x of ['data-purchase-match-query','data-purchase-match-source','data-purchase-match-role','data-purchase-match-results','data-purchase-match-confirm'])must(card,x);
for(const x of ['catalog_evidence_only:true','confirmation:createNew?', "gtin_role:role","gtin_source:source","purchase_pack_units_for_review:role==='base_unit'&&factor>1?factor:null"])must(matcher,x);
must(note,"purchaseReceiptLotsHtml(");
assert.ok(!note.includes('purchaseFinanceBlockHtml(d)'),"Financeiro cannot appear in purchase note.");
assert.ok(!runtime.includes('      purchasePaymentConfigHtml()+'),"Payable config must be absent from purchase workflow");
assert.ok(!admin.includes("x.finance_status==='review'||x.finance_status==='pending_company_match'"),"Finances cannot block the purchases queue");
must(apply,"response.catalog_sync");
must(apply,"purchaseXmlError(e)");
must(api,'verifyBlingSalePrice');
must(api,'"/produtos/"+blingId,"PATCH",{preco:price}');
must(api,'const check=await bg(token,"/produtos/"+blingId)');
must(api,'catalog_sync:sync');
must(api,'stock_unchanged:true');
must(api,'syncSupplierLink(await oauth(),Number(product.bling_product_id)');
must(admin,"purchase-xml-simple.css");
assert.ok(style.includes('.purchase-match-panel'));
console.log('Purchase/XML R31 contracts OK.');
