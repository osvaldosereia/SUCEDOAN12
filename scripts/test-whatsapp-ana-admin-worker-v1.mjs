import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeAnaMessage } from '../supabase/functions/_shared/ana-admin-config-v1.mjs';

const config={behavior:{tone:'cordial',conciseness:'short',emoji:'sparingly',use_known_first_name_on_first_greeting:true},knowledge:[],test_cases:[],triggers:[
 {key:'hours',name:'Horário',enabled:true,priority:90,channels:['all'],match:'phrase',phrases:['horario de atendimento'],action:'fixed_reply',response_text:'Atendemos em horário comercial.'},
 {key:'human',name:'Pessoa',enabled:true,priority:80,channels:['all'],match:'phrase',phrases:['quero falar com atendente'],action:'handoff'}
]};
assert.deepEqual(routeAnaMessage(config,'Qual o horário de atendimento?','0975'),{path:'fixed_reply',triggerKey:'hours',responseText:'Atendemos em horário comercial.'});
assert.equal(routeAnaMessage(config,'quero falar com atendente','1018').path,'handoff');
assert.equal(routeAnaMessage(config,'quanto custa a cesta?','0975').path,'ai');
assert.equal(routeAnaMessage(null,'oi','0975').reason,'active_config_invalid');
const worker=fs.readFileSync('supabase/functions/whatsapp-ana-worker-v1/index.ts','utf8');
assert.match(worker,/ops2_ana_active_config_v1/);
assert.match(worker,/buildAnaRuntimeInstructions/);
assert.match(worker,/evaluateAnaTriggers|routeAnaMessage/);
assert.match(worker,/ops2_attendance_ai_gate_v1[\s\S]*generateAnaDryRunSuggestion[\s\S]*ops2_attendance_ai_gate_v1/);
assert.match(worker,/ops2_ana_begin_live_send_v1[\s\S]*sendTextViaMeta[\s\S]*ops2_ana_accept_live_outbound_v1/);
assert.match(worker,/active_config_invalid[\s\S]*finishLive/);
console.log('PASS: worker published configuration, deterministic routing and fail-closed contract');
