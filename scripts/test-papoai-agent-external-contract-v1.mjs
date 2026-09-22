import assert from 'node:assert/strict';
import {
  normalizePhoneBR,
  normalizeExternalAgentPayload,
  stableProviderEventKey,
  isReservedLabHandoff,
  buildLabTextResponse,
  buildLabHandoffResponse,
  buildLabSilentResponse,
  sanitizeOutboundText,
} from '../supabase/functions/_shared/papoai-agent-external-contract-v1.mjs';

assert.equal(normalizePhoneBR('(65) 98150-9750'), '+5565981509750');

const full=normalizeExternalAgentPayload({
  text:'ignorar fallback',
  messages:[
    {role:'system',content:'segredo interno'},
    {role:'assistant',content:'fala anterior'},
    {role:'user',content:'quero a cesta mini'},
  ],
  contact:{phone_number:'5565981509750',name:'Maria'},
  session:{uid:'sess-1'},
});
assert.equal(full.phoneE164,'+5565981509750');
assert.equal(full.displayName,'Maria');
assert.equal(full.sessionKey,'sess-1');
assert.equal(full.messageText,'quero a cesta mini');
assert.equal(full.history.some(m=>m.role==='system'),false);

const alias=normalizeExternalAgentPayload({
  message:'oi',
  contact:{whatsapp:'65981509750',pushName:'Joana'},
});
assert.equal(alias.phoneE164,'+5565981509750');
assert.equal(alias.sessionKey,'phone:+5565981509750');
assert.equal(alias.messageText,'oi');

const assistantTrigger=normalizeExternalAgentPayload({
  messages:[
    {role:'user',content:'quero a Mini Bonini'},
    {role:'assistant',content:'Teste Dona Antônia concluído.'},
  ],
  contact:{phone_number:'5565981509750',name:'Maria'},
  session:{uid:'loop-test'},
});
assert.equal(assistantTrigger.triggerRole,'assistant');
assert.equal(assistantTrigger.messageText,'','assistant-triggered events must not reuse an old user message');

assert.throws(()=>normalizeExternalAgentPayload({contact:{phone:'65981509750'}}),/empty_message/);
assert.throws(()=>normalizeExternalAgentPayload({text:'oi',contact:{phone:'123'}}),/invalid_phone/);

const k1=await stableProviderEventKey({sessionKey:'s',messageText:'oi',externalMessageId:'m-1'});
const k2=await stableProviderEventKey({sessionKey:'s',messageText:'texto diferente',externalMessageId:'m-1'});
assert.equal(k1,k2);
const f1=await stableProviderEventKey({sessionKey:'s',messageText:'oi',occurredBucket:'2026-09-21T17:30'});
const f2=await stableProviderEventKey({sessionKey:'s',messageText:'olá',occurredBucket:'2026-09-21T17:30'});
assert.notEqual(f1,f2);

assert.equal(isReservedLabHandoff('TESTE_HANDOFF_DONA_ANTONIA'),true);
assert.equal(isReservedLabHandoff('quero falar com atendente'),false);
assert.deepEqual(buildLabTextResponse({text:'Teste ok',sessionKey:'s1',correlationId:'c1'}),{
  message:{text:'Teste ok'},handoff:false,session_id:'s1',correlation_id:'c1'
});
assert.equal(buildLabHandoffResponse({text:'Transferindo',sessionKey:'s1',correlationId:'c1',reason:'lab_reserved_command'}).handoff,true);
const silent=buildLabSilentResponse({sessionKey:'s1',correlationId:'c1',reason:'human_active'});
assert.equal(silent.message,null); assert.equal(silent.silent,true); assert.equal(silent.handoff,true);
assert.equal(sanitizeOutboundText('[HANDOFF] {"tool":"x"} Olá\u0000 mundo'),'Olá mundo');
const humanSession=normalizeExternalAgentPayload({
  messages:[{role:'user',content:'preciso de ajuda'}],
  session:{uid:'human-test',human_required:true,status:'ACTIVE',user_id:'operator-1'},
  contact:{phone_number:'5565999999998',name:'Teste Humano'}
});
assert.equal(humanSession.sessionHumanRequired,true);
assert.equal(humanSession.providerContext.session_human_required,true);
assert.equal(humanSession.sessionHumanUserId,'operator-1');

console.log('PASS: PapoAI Agent External pure contract');
