import assert from 'node:assert/strict';

const transport=await import('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs');
assert.equal(typeof transport.sendTemplateViaMeta,'function','transport deve exportar sendTemplateViaMeta');

let seenUrl='';
let seenOptions=null;
const fetchImpl=async(url,options)=>{
  seenUrl=String(url);seenOptions=options;
  return new Response(JSON.stringify({messages:[{id:'wamid.TEST_TEMPLATE_1'}]}),{status:200,headers:{'content-type':'application/json'}});
};

const result=await transport.sendTemplateViaMeta({
  accessToken:'secret-token',
  phoneNumberId:'1218939807961094',
  toE164:'+5565998150975',
  templateName:'pedidorecebidosite1018',
  languageCode:'pt_BR',
  components:[{type:'body',parameters:[{type:'text',text:'DA-123'},{type:'text',text:'R$ 120,00'}]}],
  graphVersion:'v26.0',
  timeoutMs:5000,
  fetchImpl,
});

assert.equal(result.ok,true);
assert.equal(result.providerMessageId,'wamid.TEST_TEMPLATE_1');
assert.equal(seenUrl,'https://graph.facebook.com/v26.0/1218939807961094/messages');
assert.equal(seenOptions.method,'POST');
assert.equal(seenOptions.headers.Authorization,'Bearer secret-token');
const payload=JSON.parse(seenOptions.body);
assert.deepEqual(payload,{
  messaging_product:'whatsapp',
  recipient_type:'individual',
  to:'5565998150975',
  type:'template',
  template:{
    name:'pedidorecebidosite1018',
    language:{code:'pt_BR'},
    components:[{type:'body',parameters:[{type:'text',text:'DA-123'},{type:'text',text:'R$ 120,00'}]}],
  },
});

await assert.rejects(()=>transport.sendTemplateViaMeta({
  accessToken:'secret-token',phoneNumberId:'1218939807961094',toE164:'+5565998150975',
  templateName:'INVALID NAME',languageCode:'pt_BR',components:[],graphVersion:'v26.0',fetchImpl,
}),error=>error?.code==='meta_invalid_request');

console.log('PASS test-whatsapp-meta-template-send-v1');
