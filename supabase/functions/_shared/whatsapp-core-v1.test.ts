import {
  normalizePhone,
  hashPayload,
  canonicalMessageFromPapoAi,
  canonicalMessagesFromMeta,
  statusEventsFromMeta,
  redactWebhookPayload,
} from './whatsapp-core-v1.mjs';

function eq(actual: unknown, expected: unknown, label='assertion'){
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test('normalizes Brazilian WhatsApp numbers without guessing invalid values',()=>{
  eq(normalizePhone('+55 65 99815-0975'),'+5565998150975');
  eq(normalizePhone('65998150975'),'+5565998150975');
  eq(normalizePhone('(65) 9815-0975'),'+5565998150975');
  eq(normalizePhone('1234'),null);
});

Deno.test('hashPayload is deterministic and distinguishes payloads',async()=>{
  eq(await hashPayload('{"a":1}'),await hashPayload('{"a":1}'));
  if(await hashPayload('{"a":1}')===await hashPayload('{"a":2}'))throw new Error('different payloads must hash differently');
});

Deno.test('redacts secrets recursively',()=>{
  const out:any=redactWebhookPayload({token:'x',nested:{authorization:'Bearer y',safe:'ok'},items:[{client_secret:'z'}]});
  eq(out.token,'[redacted]');eq(out.nested.authorization,'[redacted]');eq(out.nested.safe,'ok');eq(out.items[0].client_secret,'[redacted]');
});

Deno.test('normalizes PapoAI inbound text',()=>{
  const payload={event:'message.received',data:{message:{id:'papo-msg-1',type:'text',content:'Quero uma cesta'},contact:{phone:'65998150975'},conversation:{id:'papo-conv-1'}}};
  const out:any=canonicalMessageFromPapoAi(payload,{whatsappAccountId:'acct-0975',receivedAt:'2026-10-01T01:00:00.000Z'});
  eq(out.associable,true);eq(out.whatsapp_account_id,'acct-0975');eq(out.provider_message_id,'papo-msg-1');eq(out.phone_e164,'+5565998150975');eq(out.message.message_type,'text');eq(out.message.text_body,'Quero uma cesta');
});

const metaBase=(message:any)=>({object:'whatsapp_business_account',entry:[{id:'waba-1',changes:[{field:'messages',value:{metadata:{phone_number_id:'pn-1018'},contacts:[{profile:{name:'Cliente'}}],messages:[message]}}]}]});

Deno.test('normalizes Meta text/audio/image/interactive and resolves account only by phone_number_id',()=>{
  const resolve=(id:string)=>id==='pn-1018'?'acct-1018':null;
  const samples:any[]=[
    [{from:'5565999991111',id:'wamid.text',timestamp:'1790816400',type:'text',text:{body:'Oi'}},'text','Oi'],
    [{from:'5565999991111',id:'wamid.audio',timestamp:'1790816401',type:'audio',audio:{id:'media-a',mime_type:'audio/ogg'}},'audio',null],
    [{from:'5565999991111',id:'wamid.image',timestamp:'1790816402',type:'image',image:{id:'media-i',caption:'foto'}},'image','foto'],
    [{from:'5565999991111',id:'wamid.interactive',timestamp:'1790816403',type:'interactive',interactive:{button_reply:{id:'yes',title:'Sim'}}},'interactive','Sim'],
  ];
  for(const [message,type,text] of samples){const [out]:any[]=canonicalMessagesFromMeta(metaBase(message),resolve);eq(out.associable,true);eq(out.whatsapp_account_id,'acct-1018');eq(out.message.message_type,type);eq(out.message.text_body,text)}
});

Deno.test('unknown Meta phone_number_id stays unassociated',()=>{
  const [out]:any[]=canonicalMessagesFromMeta(metaBase({from:'5565999991111',id:'wamid.unknown',type:'text',text:{body:'Oi'}}),()=>null);
  eq(out.associable,false);eq(out.whatsapp_account_id,null);eq(out.reason,'account_unresolved');eq(out.phone_number_id,'pn-1018');
});

Deno.test('normalizes Meta delivery states and errors',()=>{
  const payload={entry:[{id:'waba-1',changes:[{value:{metadata:{phone_number_id:'pn-1018'},statuses:[
    {id:'wamid.1',status:'sent',timestamp:'1790816400',recipient_id:'5565999991111'},
    {id:'wamid.1',status:'delivered',timestamp:'1790816401',recipient_id:'5565999991111'},
    {id:'wamid.1',status:'read',timestamp:'1790816402',recipient_id:'5565999991111'},
    {id:'wamid.2',status:'failed',timestamp:'1790816403',recipient_id:'5565999992222',errors:[{code:131000,title:'Failure',message:'bad'}]},
  ]}}]}]};
  const out:any[]=statusEventsFromMeta(payload);eq(out.map(x=>x.status),['sent','delivered','read','failed']);eq(out[3].error_code,'131000');eq(out[3].error_title,'Failure');eq(out[3].error_detail,'bad');
});
