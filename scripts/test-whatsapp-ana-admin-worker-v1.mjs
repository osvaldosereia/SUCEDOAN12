import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeAnaMessage } from '../supabase/functions/_shared/ana-admin-config-v1.mjs';

const config={behavior:{tone:'cordial',conciseness:'short',emoji:'sparingly',use_known_first_name_on_first_greeting:true},knowledge:[],test_cases:[],triggers:[
 {key:'hours',name:'Horário',enabled:true,priority:90,channels:['all'],match:'phrase',phrases:['horario de atendimento'],action:'fixed_reply',response_text:'Atendemos em horário comercial.'},
 {key:'human',name:'Pessoa',enabled:true,priority:80,channels:['all'],match:'phrase',phrases:['quero falar com atendente'],action:'handoff'}
]};
assert.deepEqual(routeAnaMessage(config,'Qual o horário de atendimento?','0975'),{path:'fixed_reply',triggerKey:'hours',responseText:'Atendemos em horário comercial.'});
assert.equal(routeAnaMessage(config,'quero falar com atendente','1018').path,'handoff');
assert.equal(routeAnaMessage(config,'quanto custa a cesta?','0975').reason,'dynamic_data_requires_confirmation');
assert.equal(routeAnaMessage(config,'quanto custa a cesta?','0975').reason,'dynamic_data_requires_confirmation','unhandled price questions must fail closed before AI');
assert.equal(routeAnaMessage(config,'tem estoque?','0975').reason,'dynamic_data_requires_confirmation','unhandled stock questions must fail closed before AI');
const priced={...config,triggers:[{key:'price-safe',name:'Preço seguro',enabled:true,priority:100,channels:['all'],match:'phrase',phrases:['quanto custa'],actions:[{type:'fixed_reply',response_text:'Consulte o catálogo oficial.'}]}]};
assert.equal(routeAnaMessage(priced,'quanto custa a cesta?','0975').path,'fixed_reply','an explicit deterministic rule may safely override the dynamic-data guard');
const multi={...config,triggers:[{key:'basket',name:'Cestas',enabled:true,priority:99,channels:['all'],match:'phrase',phrases:['cesta basica'],conditions:[{type:'human_mode',value:false},{type:'customer_linked',value:true}],actions:[{type:'label',label_id:'00000000-0000-4000-8000-000000000002'},{type:'continue_ai'}]}]};
assert.equal(routeAnaMessage(multi,'quero cesta básica','0975',{humanMode:false,customerLinked:false}).path,'ai');
assert.equal(routeAnaMessage(multi,'quero cesta básica','0975',{humanMode:false,customerLinked:true}).path,'actions');
assert.equal(routeAnaMessage(multi,'quero cesta básica','0975',{humanMode:false,customerLinked:true}).actions.length,2);
const removal={...config,triggers:[{key:'remove-interest',name:'Remover interesse',enabled:true,priority:99,channels:['all'],match:'phrase',phrases:['nao quero mais'],actions:[{type:'remove_label',label_id:'00000000-0000-4000-8000-000000000002'}]}]};
assert.equal(routeAnaMessage(removal,'não quero mais','0975').path,'remove_label');
assert.equal(routeAnaMessage(null,'oi','0975').reason,'active_config_invalid');
const worker=fs.readFileSync('supabase/functions/whatsapp-ana-worker-v1/index.ts','utf8');
assert.match(worker,/ops2_ana_active_config_v1/);
assert.match(worker,/buildAnaRuntimeInstructions/);
assert.match(worker,/evaluateAnaTriggers|routeAnaMessage/);
assert.match(worker,/ops2_attendance_ai_gate_v1[\s\S]*generateAnaDryRunSuggestion[\s\S]*ops2_attendance_ai_gate_v1/);
assert.match(worker,/ops2_ana_begin_live_send_v1[\s\S]*sendTextViaMeta[\s\S]*ops2_ana_accept_live_outbound_v1/);
assert.match(worker,/active_config_invalid[\s\S]*finishLive/);
assert.match(worker,/human_takeover_during_trigger_actions/);
assert.match(worker,/ops2_ana_remove_trigger_label_v1/,'worker must use provenance-safe label removal RPC');
assert.match(worker,/admin_trigger_label_removed/,'worker must record deterministic label removal outcome');
assert.match(worker,/select\('customer_id,wa_contact_e164'\)/,'worker must read only the explicit conversation customer link');
assert.match(worker,/customerLinked:Boolean\(conversation\.data\.customer_id\)/,'worker must pass explicit customer linkage to trigger routing');
assert.match(worker,/conversation_context_unavailable/,'missing conversation context must fail closed');
assert.match(worker,/const routeMetadata=\{trigger_key:routed\.triggerKey\|\|null,active_version:activeConfig\.data\.version\}/,'live outcomes must retain the matched trigger key for metrics');
assert.match(worker,/p_metadata:\{\.\.\.routeMetadata,outbox_id:/,'successful sends must persist trigger metadata');
console.log('PASS: worker published configuration, deterministic routing and fail-closed contract');
