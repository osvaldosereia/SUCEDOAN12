import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {postorderTemplates} from './meta-postorder-templates-v3.mjs';
import {validateTemplateDraft,MetaTemplatesError} from '../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs';
import {sendTemplateViaMeta} from '../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';
const read=path=>fs.readFileSync(path,'utf8');
const html=read('pedido/index.html'),customer=read('pedido/customer-actions.js'),addon=read('adicionar/index.html');
const edge=read('supabase/functions/order-customer-actions-v1/index.ts');
const orders=read('supabase/functions/admin-orders-v1/index.ts');
const catalog=read('supabase/functions/order-addon-public-v1/index.ts');
const addonSql=read('supabase/migrations/20261012194000_order_addon_offers_only_v1.sql');
const confirmSql=read('supabase/migrations/20261012193000_customer_postorder_confirmation_v1.sql');
const transport=read('supabase/functions/_shared/whatsapp-meta-transport-v1.mjs');

assert.equal(postorderTemplates.length,2);
for(const t of postorderTemplates){
 const draft=validateTemplateDraft(t);
 assert.equal(draft.category,'UTILITY');
 assert.ok(draft.components[0].text.includes('\n\n'),'message layout should preserve line breaks');
 assert.ok(draft.components[0].text.includes('{{13}}'));
 assert.ok(!draft.components[0].text.includes('{{14}}'));
 assert.equal(draft.components[1].buttons[0].url,'https://donaantonia.com.br/pedido/?c={{1}}');
 assert.equal(draft.components[1].buttons[0].example[0].length,64);
 assert.match(orders,new RegExp(t.name));
}
for(const unsafe of ['https://evil.example/pedido/?c={{1}}','https://donaantonia.com.br/admin/?c={{1}}']){
 const t=structuredClone(postorderTemplates[0]);t.components[1].buttons[0].url=unsafe;
 assert.throws(()=>validateTemplateDraft(t),MetaTemplatesError);
}
assert.match(orders,/status==="APPROVED"/);
assert.match(orders,/customerActionCode\?\[\]:/);
assert.match(orders,/provider:"meta"/);
assert.match(orders,/\[REDACTED\]/);
assert.match(transport,/sub_type.*url/);
assert.match(transport,/\^\[a-f0-9\]\{64\}\$/);
assert.match(catalog,/\.eq\("is_offer",true\)/);
assert.match(addonSql,/coalesce\(v_product\.is_offer,false\) is not true/);
assert.match(addonSql,/reserve_vitrine_order_stock_v1/);
assert.match(addon,/returnToOrderLink/);
assert.match(addon,/Ver ofertas|Ofertas para o seu pedido/);
assert.match(customer,/expected_total_cents/);
assert.match(customer,/s\.can_add_offers===true/,'offers button is only visible for eligible orders');
assert.match(edge,/ops3_order_addon_eligibility_v1/,'customer session must check live eligibility');
assert.match(edge,/can_add_offers:!eligibility.error/,'offers must fail closed');
assert.match(addon,/scopedKey\(TOKEN_KEY\)/,'tokens must be order-scoped');
assert.match(addon,/scopedKey\(PENDING_KEY\)/,'retries must be order-scoped');
assert.match(addon,/state\.priceByProduct\.get\(row.product_id\)/,'cart total keeps products from earlier searches');
assert.match(addon,/requestSeq!==state.requestSeq/,'ignore out-of-order catalog responses');
assert.match(customer,/window\.confirm/);
assert.match(customer,/\/adicionar\/\?k=/);
assert.match(customer,/history\.replaceState/);
assert.match(html,/customer-actions\.js/);
assert.match(html,/await window\.DACustomerActions\?\.bootstrap/);
assert.match(html,/window\.DACustomerActions\?\.render\(data\)/);
assert.match(edge,/x-customer-action-token/);
assert.match(edge,/ops3_confirm_customer_order_v1/);
assert.match(edge,/ops3_create_order_addon_session_v1/);
assert.match(edge,/consume_public_rate_limit/);
assert.match(confirmSql,/from private\.order_customer_actions_v1 where token_hash=p_token_hash for update/);
assert.match(confirmSql,/from public\.orders where id=a\.order_id for update/);
assert.match(confirmSql,/o\.updated_at<>p_expected_updated_at/);
assert.match(confirmSql,/round\(o\.total,2\)<>round\(p_expected_total,2\)/);
assert.match(confirmSql,/status='confirmed',confirmed_at=now\(\)/);
assert.match(confirmSql,/reserve_vitrine_order_stock_v1/);
assert.match(confirmSql,/ops2_refresh_order_public_snapshot_v1/);
new vm.Script(customer,{filename:'pedido/customer-actions.js'});
for(const htmlDoc of [html,addon])for(const m of htmlDoc.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
 if(m[1].trim())new vm.Script(m[1]);
}
const token='0123456789abcdef'.repeat(4);
const sent=[];
const fetchImpl=async(_url,{body})=>{
 sent.push(JSON.parse(body));
 return new Response(JSON.stringify({messages:[{id:'wamid.FAKE_POSTORDER_TEST'}]}),{
  status:200,headers:{'content-type':'application/json'}
 });
};
await sendTemplateViaMeta({
 accessToken:'test',phoneNumberId:'123456789012',toE164:'+5565999988888',
 templateName:'pedidoorganizadosite0975v3',languageCode:'pt_BR',
 components:[{type:'body',parameters:[{type:'text',text:'Pedido'}]},
   {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:token}]}],
 graphVersion:'v23.0',fetchImpl
});
assert.equal(sent[0].template.components[1].sub_type,'url');
assert.equal(sent[0].template.components[1].parameters[0].text,token);
const templatesApi=read('supabase/functions/admin-whatsapp-templates-v1/index.ts');
const templatesAdmin=read('vitrine/admin/marketing/template-center.js');
const canonicalMeta=read('supabase/functions/_shared/customer-postorder-template-v3.mjs');
assert.match(templatesApi,/postorder_provision/,'owner-only provisioning endpoint must exist');
assert.match(templatesApi,/auth\.role!=="owner"/,'only owner may submit official templates');
assert.match(templatesApi,/await syncTemplates\(account\)/,'remote sync required before create to prevent duplicate templates');
assert.match(templatesApi,/buildPostorderTemplate\(channel\)/,'provider uses canonical template builder');
assert.match(templatesAdmin,/data-postorder-provision/,'admin exposes official CTA creation');
assert.match(templatesAdmin,/adminPost\(TEMPLATE_API,'postorder_provision',\{\}\)/,'admin submits via authenticated endpoint');
new vm.Script(templatesAdmin.replace(/^import[^\n]*\n/gm,''),{filename:'template-center.js'});
new vm.Script(canonicalMeta.replace(/^export /gm,''),{filename:'canonical-template.mjs'});
// Behavioral smoke tests: execute the public panel with a mocked DOM and API.
// A hidden optional button must not crash the confirmation panel.
async function simulateCustomerPanel(canAddOffers){
  const viewToken='a'.repeat(16),capability='b'.repeat(64);
  const storage=new Map();
  const parent={insertBefore(element){element.parentNode=this}};
  const panel={style:{},innerHTML:'',parentNode:null,querySelector(){return null}};
  const app={parentNode:parent,nextSibling:null};
  const buttons=new Map();
  const document={
    createElement(){return panel},
    querySelector(selector){
      if(selector==='#app')return app;
      const id=selector.replace(/^#/,'');
      if(!panel.innerHTML.includes('id="'+id+'"'))return null;
      if(!buttons.has(id))buttons.set(id,{onclick:null});
      return buttons.get(id);
    }
  };
  const payload={ok:true,public_token:viewToken,status:'storefront_received',
    total:150,updated_at:'2026-10-12T20:00:00Z',can_confirm:true,
    can_add_offers:canAddOffers};
  const ctx={
    document,location:{search:'?c='+capability,pathname:'/pedido/'},
    URLSearchParams,sessionStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>storage.set(key,value),
      removeItem:key=>storage.delete(key)
    },
    history:{replaceState(){}},fetch:async()=>({
      ok:true,json:async()=>payload
    }),
    window:{confirm:()=>false},console,setTimeout:()=>{},Math
  };
  vm.runInNewContext(customer,ctx);
  await ctx.window.DACustomerActions.bootstrap();
  ctx.window.DACustomerActions.render({current_status:'storefront_received',snapshot:{final_total:150}});
  assert.equal(panel.innerHTML.includes('id="postorderOffers"'),canAddOffers);
  assert.ok(panel.innerHTML.includes('id="postorderConfirm"'));
  assert.equal(typeof buttons.get('postorderConfirm')?.onclick,'function');
  assert.equal(Boolean(buttons.get('postorderOffers')),canAddOffers);
}
await simulateCustomerPanel(false);
await simulateCustomerPanel(true);
console.log('PASS: mocked public order UI: with and without eligible offers');
// Customer offer deep-link smoke test: Meta URL token must create a new
// server-authorized quick-add session and never reuse or expose order_id.
const offerBridge=read('ofertas/index.html');
assert.match(offerBridge,/name="referrer" content="no-referrer"/);
assert.match(offerBridge,/name="robots" content="noindex,nofollow,noarchive"/);
assert.match(offerBridge,/history\.replaceState\(null,'',location\.pathname\)/);
assert.match(offerBridge,/action=.*encodeURIComponent\(action\)/);
assert.match(offerBridge,/api\('addon_session','POST'\)/);
assert.doesNotMatch(offerBridge,/order_id\s*:/,'no browser-controlled order identity');
const bridgeSource=[...offerBridge.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).find(Boolean);
assert.ok(bridgeSource,'bridge needs an inline script');
new vm.Script(bridgeSource,{filename:'ofertas/index.html'});
async function simulateOfferBridge({token,eligible=true,failPost=false}){
  const callLog=[],replaces=[],historyCalls=[];
  const status={textContent:''},anchor={href:''};
  const back={hidden:true,querySelector:()=>anchor};
  const document={getElementById:id=>id==='status'?status:id==='back'?back:null};
  const ctx={
    URL,URLSearchParams,document,
    location:{pathname:'/ofertas/',search:'?c='+token,replace:url=>replaces.push(url)},
    history:{replaceState:(...a)=>historyCalls.push(a)},
    fetch:async(url,options)=>{
      const action=new URL(url).searchParams.get('action');
      callLog.push({action,method:options.method,token:options.headers['X-Customer-Action-Token']});
      if(action==='session')return {ok:true,json:async()=>({
        ok:true,can_add_offers:eligible,public_token:'a'.repeat(16)
      })};
      return {ok:!failPost,json:async()=>failPost?
        {ok:false,error:'addon_window_expired'}:
        {ok:true,addon_token:'b'.repeat(64)}};
    }
  };
  await vm.runInNewContext(bridgeSource,ctx);
  return {callLog,replaces,historyCalls,status,back,anchor};
}
const direct=await simulateOfferBridge({token:'c'.repeat(64)});
assert.equal(direct.callLog.length,2);
assert.deepEqual(direct.callLog.map(x=>x.action),['session','addon_session']);
assert.equal(direct.callLog[1].method,'POST');
assert.equal(direct.replaces[0],'/adicionar/?k='+ 'a'.repeat(16)+'#t='+'b'.repeat(64));
assert.equal(direct.historyCalls[0][2],'/ofertas/');
assert.equal(direct.anchor.href,'/pedido/?k='+ 'a'.repeat(16));
const blocked=await simulateOfferBridge({token:'c'.repeat(64),eligible:false});
assert.equal(blocked.callLog.length,1,'ineligible customer must not receive an add-on session');
assert.equal(blocked.replaces.length,0);
const invalid=await simulateOfferBridge({token:'bad'});
assert.equal(invalid.callLog.length,0,'invalid capability must not hit the API');
assert.equal(invalid.replaces.length,0);
const expired=await simulateOfferBridge({token:'c'.repeat(64),failPost:true});
assert.equal(expired.replaces.length,0,'failed sessions must not redirect');
console.log('PASS: secure offer button: eligible, expired, invalid, failed session');


const followupTemplates=read('supabase/functions/_shared/customer-postorder-followup-templates-v1.mjs');
const templateValidation=read('supabase/functions/_shared/whatsapp-meta-templates-v1.mjs');
const templatesApiSource=read('supabase/functions/admin-whatsapp-templates-v1/index.ts');
assert.match(followupTemplates,/pedidoofertas.+v1/,'dedicated reusable Marketing offer template');
assert.match(followupTemplates,/pedidoconfirmacao.+v1/,'Utility confirmation template per channel');
assert.match(followupTemplates,/Preciso alterar/);
assert.match(followupTemplates,/QUICK_REPLY/);
assert.match(followupTemplates,/https:\/\/donaantonia\.com\.br\/ofertas\/\?c=\{\{1\}\}/);
assert.ok(templateValidation.includes("['/pedido/','/ofertas/']"),'only order/offer URL paths supported');
assert.match(templatesApiSource,/buildPostorderOffersTemplate\(channel\)/);
assert.match(templatesApiSource,/buildPostorderConfirmTemplate\(channel\)/);
console.log('PASS: Meta templates for three-message WhatsApp flow in two channels');
console.log('PASS: Meta Utility URL, 256-bit capability, offers only, CAS confirmation, storefront JS');


// GitHub Pages delivers /404.html for unrecognized static routes.
// The fallback must retain the same authorized offer behavior rather than
// silently redirect the customer to the homepage/new checkout.
const pages404=read('404.html');
const pagesSource=[...pages404.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).find(Boolean);
assert.ok(pagesSource,'Pages fallback must contain working route handling');
new vm.Script(pagesSource,{filename:'404.html'});
assert.match(pages404,/name="referrer" content="no-referrer"/);
assert.match(pagesSource,/ops3|order-customer-actions-v1/);
async function simulatePages404(path,search=''){
  const token='c'.repeat(64),calls=[],navigations=[],historyCalls=[];
  const notice={textContent:''},back={href:'',textContent:'',hidden:true},
    spinner={hidden:false},saved=new Map();
  const ctx={
    URLSearchParams,
    location:{pathname:path,search,replace:url=>navigations.push(url)},
    history:{replaceState:(...args)=>historyCalls.push(args)},
    document:{
      title:'',
      getElementById:id=>id==='notice'?notice:id==='back'?back:null,
      querySelector:selector=>selector==='.spinner'?spinner:null
    },
    sessionStorage:{setItem:(key,value)=>saved.set(key,value)},
    fetch:async (url,options)=>{
      calls.push({url,options});
      const action=new URL(url).searchParams.get('action');
      if(action==='session')return {ok:true,json:async()=>({
        ok:true,can_add_offers:true,public_token:'a'.repeat(16)
      })};
      if(action==='addon_session')return {ok:true,json:async()=>({
        ok:true,addon_token:'b'.repeat(64)
      })};
      return {ok:true,json:async()=>({phone_e164:'5565999999999'})};
    }
  };
  await vm.runInNewContext(pagesSource,ctx);
  return {token,calls,navigations,historyCalls,notice,back,spinner,saved};
}
const pagesPreview=await simulatePages404('/ofertas/');
assert.deepEqual(pagesPreview.navigations,['/?ofertas=1']);
assert.equal(pagesPreview.calls.length,0);
const pagesPersonal=await simulatePages404('/ofertas/','?c='+'c'.repeat(64));
assert.deepEqual(pagesPersonal.calls.map(c=>new URL(c.url).searchParams.get('action')),
  ['session','addon_session']);
assert.equal(pagesPersonal.calls[1].options.method,'POST');
assert.equal(pagesPersonal.calls[0].options.headers['X-Customer-Action-Token'],'c'.repeat(64));
assert.equal(pagesPersonal.historyCalls[0][2],'/ofertas/');
assert.deepEqual(pagesPersonal.navigations,
  ['/adicionar/?k='+'a'.repeat(16)+'#t='+'b'.repeat(64)]);
const pagesBad=await simulatePages404('/ofertas/','?c=wrong');
assert.equal(pagesBad.calls.length,0);
assert.equal(pagesBad.navigations.length,0);
assert.match(pagesBad.notice.textContent,/não é válido/i);
const pagesCart=await simulatePages404('/catalogo_1234/');
assert.deepEqual(pagesCart.navigations,['/']);
assert.equal(pagesCart.saved.get('da_vitrine_whatsapp_phone_v1'),'5565999999999');
const pagesAdd=await simulatePages404('/adicionar/');
assert.equal(pagesAdd.navigations.length,0,'addon route must not silently redirect to a new checkout');
assert.match(pagesAdd.notice.textContent,/não está disponível/);
const pagesUnknown=await simulatePages404('/not-found-elsewhere/');
assert.deepEqual(pagesUnknown.navigations,['/']);
console.log('PASS: GitHub Pages 404 offer fallback, preview, secure order and legacy catalog links');
