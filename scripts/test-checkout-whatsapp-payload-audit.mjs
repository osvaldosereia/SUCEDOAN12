import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

const orderId='8754b5f1-f0c4-4963-af0e-e0e3a6088570';
const outboxId='09c910eb-df0e-4dbb-a413-a459e33e60c2';
const accountId='308660df-72a0-4e23-b3e9-b36d7307bb20';
const canonicalMessageId='11111111-2222-4333-8444-555555555555';
const providerMessageId='wamid.TEST_ORDER_CONFIRMATION';
const account={id:accountId,phone_e164:'+5565998150975',phone_number_id:'945659128620084',is_active:true};
const rows=[{name_snapshot:'Arroz 5kg',quantity:1},{name_snapshot:'Feijão 1kg',quantity:2}];
const order={id:orderId,order_number:'DA-TEST-12345678',total:92,payment_method:'pix',phone_e164:'+5565999828360',customer_id:'existing',created_at:'2026-10-02T13:03:00Z',customer_snapshot:{name:'Antonia Guedes'},delivery_address:{street:'Rua teste',number:'10',district:'Jardim',city:'Cuiabá',delivery_date:'2026-10-03'},checkout_snapshot:{customer:{address:{reference:'Grade branca'}}}};

let handler;
let audit=null;
let metaCall=null;
let acceptedArgs=null;

const query=(table)=>{
  const q={
    select(){return this},
    eq(){return this},
    update(payload){if(table==='ops2_whatsapp_outbox_v1')audit=payload.payload;return this},
    async maybeSingle(){
      if(table==='orders')return {data:order,error:null};
      return {data:null,error:null};
    },
    async order(){
      if(table==='order_items')return {data:rows,error:null};
      return {data:[],error:null};
    },
    then(resolve){
      if(table==='whatsapp_accounts')resolve({data:[account],error:null});
      else resolve({data:null,error:null});
    }
  };
  return q;
};

const db={
  from:table=>query(table),
  rpc:async(name,args)=>{
    if(name.includes('claim'))return {data:{found:true,item:{id:outboxId,order_id:orderId,recipient_kind:'customer',phone_e164:'+5565999828360',channel_origin:'0975',whatsapp_account_id:accountId,attempt_count:1,payload:{kind:'order_received'}}},error:null};
    if(name==='ops2_order_public_link_v1')return {data:{public_code:'DA123',public_token:'abc123abc123abc1',public_url:'https://donaantonia.com.br/p/?k=abc123abc123abc1'},error:null};
    if(name==='ops2_accept_order_whatsapp_meta_v1'){
      acceptedArgs=args;
      return {data:{ok:true,status:'sent',message_id:canonicalMessageId,status_current:'accepted'},error:null};
    }
    return {data:{ok:true},error:null};
  }
};

class MetaTransportError extends Error {}
const sendTemplateViaMeta=async(args)=>{
  metaCall=args;
  return {ok:true,provider:'meta',providerMessageId,httpStatus:200};
};

const env={
  SUPABASE_URL:'https://database.test',
  SUPABASE_SERVICE_ROLE_KEY:'internal',
  META_WHATSAPP_ACCESS_TOKEN:'meta-test-token',
  META_WHATSAPP_GRAPH_VERSION:'v23.0'
};
const sandbox={
  URL,Request,Response,Intl,Date,console,createClient:()=>db,sendTemplateViaMeta,MetaTransportError,
  setTimeout,clearTimeout,
  Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn}
};
const source=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source),sandbox);

const response=await handler(new Request('https://database.test/dispatch',{method:'POST',headers:{'x-internal-key':'internal','Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,dispatch_scope:'checkout_auto'})}));
const body=await response.json();
assert.equal(response.status,200);
assert.equal(body.provider,'meta');
assert.equal(body.external_message_id,providerMessageId);

const providerRequest=audit?.provider_request;
assert.equal(providerRequest?.products_text,'• 1x Arroz 5kg\n• 2x Feijão 1kg');
assert.equal(providerRequest?.customer_name,'Antonia Guedes');
assert.ok(providerRequest?.delivery_address_full.includes('Grade branca'),'confirmation must retain checkout address reference');

assert.equal(metaCall?.phoneNumberId,account.phone_number_id);
assert.equal(metaCall?.toE164,'+5565999828360');
assert.equal(metaCall?.templateName,'pedidoorganizadosite0975v2');
assert.equal(metaCall?.languageCode,'pt_BR');
assert.equal(metaCall?.components?.length,1);
const parameters=metaCall.components[0].parameters;
assert.equal(parameters.length,14);
assert.equal(parameters[1].text,'DA123','template must expose only the public order code');
assert.equal(String(parameters[11].text).replace(/\s/g,' '),String(providerRequest.total_formatted).replace(/\s/g,' '));
assert.equal(parameters[12].text,'PIX');
assert.equal(parameters[13].text,'https://donaantonia.com.br/p/?k=abc123abc123abc1');
assert.ok(parameters[10].text.includes('Arroz 5kg'),'organized confirmation must retain products');
assert.ok(parameters[5].text.includes('Grade branca'),'organized confirmation address must retain checkout reference');
assert.ok(!parameters.some(p=>String(p.text).includes('DA-TEST-12345678')),'technical order_number must never be customer-visible');

assert.deepEqual(JSON.parse(JSON.stringify(audit?.meta_request?.components)),JSON.parse(JSON.stringify(metaCall.components)),'outbox must audit exactly the Meta template components');
assert.equal(acceptedArgs?.p_outbox_id,outboxId);
assert.equal(acceptedArgs?.p_provider_message_id,providerMessageId);
assert.ok(acceptedArgs?.p_accepted_at,'canonical accept must persist accepted timestamp');

console.log('complete multiline confirmation and Meta template payload audit: OK');
