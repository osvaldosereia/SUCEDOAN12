import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

// Uses the real function sources from the production Admin, not reimplemented UI logic.
// No customer data, network requests, or Supabase credentials.
const admin=readFileSync(new URL('../vitrine/admin/index.html',import.meta.url),'utf8');
function realFunction(signature){
  const start=admin.indexOf('\n  '+signature);
  assert.ok(start>=0,'function absent: '+signature);
  const begin=start+3;
  const rest=admin.slice(begin);
  const next=/\n  (?:async )?function [A-Za-z_][\w]*\(/g;
  next.lastIndex=signature.length;
  const found=next.exec(rest);
  assert.ok(found,'function boundary absent: '+signature);
  return rest.slice(0,found.index);
}
const authentic=[
  'function xmlCatalogFiscalEvidenceMarkup()',
  'function xmlCatalogFieldApplicationMarkup(active)',
  'async function xmlCatalogFieldReviewLoad(productId,key)',
  'async function xmlCatalogFiscalLoad()',
  'function xmlCatalogDetailBind()'
].map(realFunction).join('\n\n');
const fixture=String.raw`
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={
  xmlCatalogOpen:true,xmlCatalogDetailKey:'candidate1',
  xmlCatalogDetail:{candidate:{display_name:'Produto teste'},observations:[{
    purchase_item_id:'item1',observation_id:'observation1',linked_product_id:'product1'
  }]},
  xmlCatalogSelectedObservation:'item1',
  xmlFieldReviewProductId:'product1',xmlFieldReviewLoaded:true,
  xmlFieldReviewItems:[{id:'review1',field_name:'name',status:'approved',revision:1,
    original_value:'Nome anterior',proposed_value:'Novo nome'}],
  xmlFieldApplicationProductId:'product1',xmlFieldApplications:[],
  xmlFieldApplyPreview:null,xmlFieldApplyBusy:false,xmlFieldApplyError:'',
  xmlFiscalKey:null,xmlFiscalData:null,xmlFiscalError:'',xmlFiscalLoading:false,
  xmlFiscalRequestId:0
};
const calls=[];
let active=false,applied=false;
window.__allowConfirm=false;
window.__promptResponse='';
function confirm(){return window.__allowConfirm}
function prompt(){return window.__promptResponse}
function toast(s){window.__lastToast=String(s)}
function errorMessage(s){return String(s)}
async function purchaseApi(action,payload={}){
  calls.push({action,payload});
  if(action==='xml_catalog_fiscal_dossier')return {
    ok:true,readonly:true,comparison_scope:{partial:true},reasons:['Divergência entre fornecedores'],
    fields:{ncm:{values:[{value:'19059080',observations:3}]}}
  };
  if(action==='xml_field_apply_preview')return {
    readonly:true,review_id:payload.review_id,product_id:'product1',
    review_revision:1,can_apply:!active&&!applied
  };
  if(action==='xml_field_apply_commit'){
    if(active||applied)throw Error('product_not_inactive');
    applied=true;
    return {ok:true};
  }
  if(action==='xml_field_apply_rollback'){
    if(active||!applied)throw Error('rollback_blocked');
    applied=false;return {ok:true};
  }
  if(action==='xml_field_review_list')return {items:state.xmlFieldReviewItems};
  if(action==='xml_field_apply_list')return {
    items:applied?[{id:'application1',product_id:'product1',status:'applied',
    before_value:'Nome anterior',applied_value:'Novo nome'}]:[]
  };
  throw Error('mock_action_not_permitted:'+action);
}
function xmlCatalogDetailRefresh(){
  const host=$('#xmlCatalogBody');if(!host)return;
  host.innerHTML=xmlCatalogFiscalEvidenceMarkup()+
    '<button id="xmlFieldReviewLoad" type="button">Consultar decisões</button>'+
    xmlCatalogFieldApplicationMarkup(state.xmlCatalogDetail.observations[0]);
  xmlCatalogDetailBind();
}
function testBoot(){xmlCatalogDetailRefresh()}
window.__xmlTest={state,calls,testBoot,setActive(v){active=Boolean(v)},
  wasApplied(){return applied}};
`;
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport});
    let sent=0;
    await page.route('**/*',route=>{sent++;route.abort();});
    await page.setContent('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="max-width:900px;padding:12px"><div id="xmlCatalogBody"></div></main></body></html>');
    await page.addScriptTag({content:authentic+'\n'+fixture});
    await page.evaluate(()=>window.__xmlTest.testBoot());
    assert.equal(await page.getByText('Consultar dossiê fiscal').count(),1);
    assert.equal(await page.locator('[data-xml-apply-commit]').count(),0,'cannot commit without server preview');
    assert.equal(await page.evaluate(()=>window.__xmlTest.calls.length),0,'UI must load lazily');
    await page.locator('#xmlFiscalLoad').click();
    await page.getByText('Histórico PARCIAL.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.__xmlTest.calls.filter(x=>x.action==='xml_catalog_fiscal_dossier').length),1);
    assert.equal(await page.locator('[data-xml-apply-commit]').count(),0);
    await page.locator('[data-xml-apply-preview]').click();
    await page.locator('[data-xml-apply-commit]').waitFor();
    await page.locator('[data-xml-apply-commit]').click();
    assert.equal(await page.evaluate(()=>window.__xmlTest.wasApplied()),false,'reject without confirmation');
    await page.evaluate(()=>{window.__allowConfirm=true;window.__promptResponse='APLICAR_NOME_APROVADO_XML'});
    await page.locator('[data-xml-apply-commit]').click();
    await page.locator('[data-xml-apply-rollback]').waitFor();
    assert.equal(await page.evaluate(()=>window.__xmlTest.wasApplied()),true);
    await page.evaluate(()=>{window.__promptResponse='REVERTER_NOME_APLICADO_XML'});
    await page.locator('[data-xml-apply-rollback]').click();
    await page.locator('[data-xml-apply-rollback]').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.__xmlTest.wasApplied()),false);
    await page.evaluate(()=>{window.__xmlTest.setActive(true)});
    await page.locator('[data-xml-apply-preview]').click();
    assert.equal(await page.locator('[data-xml-apply-commit]').count(),0,'active product must not offer commit');
    const actions=await page.evaluate(()=>window.__xmlTest.calls.map(x=>x.action));
    assert.equal(actions.filter(x=>x==='xml_field_apply_commit').length,1);
    assert.equal(actions.filter(x=>x==='xml_field_apply_rollback').length,1);
    assert.equal(sent,0,'Browser test must not call any remote service');
    await page.close();
    console.log('PASS R30 chromium actual Admin handlers '+viewport.width+'px: fiscal lazy, preview, double confirmation, apply, rollback, active blocked, offline');
  }
}finally{await browser.close();}
