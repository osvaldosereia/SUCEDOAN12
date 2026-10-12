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
console.log('PASS: Meta Utility URL, 256-bit capability, offers only, CAS confirmation, storefront JS');
