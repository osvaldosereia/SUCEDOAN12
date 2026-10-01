import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  hashPayload,
  canonicalMessageFromPapoAi,
  canonicalMessagesFromMeta,
  statusEventsFromMeta,
  redactWebhookPayload,
} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';

test('normalizes Brazilian WhatsApp numbers without guessing invalid values', () => {
  assert.equal(normalizePhone('+55 65 99815-0975'), '+5565998150975');
  assert.equal(normalizePhone('65998150975'), '+5565998150975');
  assert.equal(normalizePhone('(65) 9815-0975'), '+5565998150975');
  assert.equal(normalizePhone('1234'), null);
});

test('hashPayload is deterministic and distinguishes different raw payloads', async () => {
  assert.equal(await hashPayload('{"a":1}'), await hashPayload('{"a":1}'));
  assert.notEqual(await hashPayload('{"a":1}'), await hashPayload('{"a":2}'));
});

test('redacts secrets recursively', () => {
  const out = redactWebhookPayload({token:'x',nested:{authorization:'Bearer y',safe:'ok'},items:[{client_secret:'z'}]});
  assert.equal(out.token, '[redacted]');
  assert.equal(out.nested.authorization, '[redacted]');
  assert.equal(out.nested.safe, 'ok');
  assert.equal(out.items[0].client_secret, '[redacted]');
});

test('normalizes a PapoAI inbound text message', () => {
  const payload={event:'message.received',data:{message:{id:'papo-msg-1',type:'text',content:'Quero uma cesta'},contact:{phone:'65998150975'},conversation:{id:'papo-conv-1'}}};
  const out=canonicalMessageFromPapoAi(payload,{whatsappAccountId:'acct-0975',receivedAt:'2026-10-01T01:00:00.000Z'});
  assert.equal(out.associable,true);
  assert.equal(out.whatsapp_account_id,'acct-0975');
  assert.equal(out.provider_message_id,'papo-msg-1');
  assert.equal(out.phone_e164,'+5565998150975');
  assert.equal(out.message.message_type,'text');
  assert.equal(out.message.text_body,'Quero uma cesta');
  assert.equal(out.message.sender_kind,'customer');
});

const metaBase=(message)=>({object:'whatsapp_business_account',entry:[{id:'waba-1',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'5565984491018',phone_number_id:'pn-1018'},contacts:[{profile:{name:'Cliente'},wa_id:'5565999991111'}],messages:[message]}}]}]});

test('normalizes Meta text, audio, image and interactive messages to the resolved account', () => {
  const resolve=(phoneNumberId)=>phoneNumberId==='pn-1018'?'acct-1018':null;
  const samples=[
    [{from:'5565999991111',id:'wamid.text',timestamp:'1790816400',type:'text',text:{body:'Oi'}},'text','Oi'],
    [{from:'5565999991111',id:'wamid.audio',timestamp:'1790816401',type:'audio',audio:{id:'media-a',mime_type:'audio/ogg; codecs=opus'}},'audio',null],
    [{from:'5565999991111',id:'wamid.image',timestamp:'1790816402',type:'image',image:{id:'media-i',mime_type:'image/jpeg',caption:'foto'}},'image','foto'],
    [{from:'5565999991111',id:'wamid.interactive',timestamp:'1790816403',type:'interactive',interactive:{type:'button_reply',button_reply:{id:'yes',title:'Sim'}}},'interactive','Sim'],
  ];
  for(const [message,type,text] of samples){
    const [out]=canonicalMessagesFromMeta(metaBase(message),resolve);
    assert.equal(out.associable,true);
    assert.equal(out.whatsapp_account_id,'acct-1018');
    assert.equal(out.phone_number_id,'pn-1018');
    assert.equal(out.message.message_type,type);
    assert.equal(out.message.text_body,text);
  }
});

test('does not guess a WhatsApp account when Meta phone_number_id is unknown', () => {
  const [out]=canonicalMessagesFromMeta(metaBase({from:'5565999991111',id:'wamid.unknown',timestamp:'1790816400',type:'text',text:{body:'Oi'}}),()=>null);
  assert.equal(out.associable,false);
  assert.equal(out.whatsapp_account_id,null);
  assert.equal(out.reason,'account_unresolved');
  assert.equal(out.phone_number_id,'pn-1018');
});

test('normalizes Meta sent/delivered/read/failed statuses with errors', () => {
  const payload={object:'whatsapp_business_account',entry:[{id:'waba-1',changes:[{field:'messages',value:{metadata:{phone_number_id:'pn-1018'},statuses:[
    {id:'wamid.1',status:'sent',timestamp:'1790816400',recipient_id:'5565999991111'},
    {id:'wamid.1',status:'delivered',timestamp:'1790816401',recipient_id:'5565999991111'},
    {id:'wamid.1',status:'read',timestamp:'1790816402',recipient_id:'5565999991111'},
    {id:'wamid.2',status:'failed',timestamp:'1790816403',recipient_id:'5565999992222',errors:[{code:131000,title:'Failure',message:'bad'}]},
  ]}}]}]};
  const out=statusEventsFromMeta(payload);
  assert.deepEqual(out.map(x=>x.status),['sent','delivered','read','failed']);
  assert.equal(out[3].error_code,'131000');
  assert.equal(out[3].error_title,'Failure');
  assert.equal(out[3].error_detail,'bad');
  assert.equal(out[0].recipient_phone_e164,'+5565999991111');
});
