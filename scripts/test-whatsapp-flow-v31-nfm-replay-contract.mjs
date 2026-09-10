import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/whatsapp-ingest-make-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260910212400_whatsapp_flow_v31_nfm_replay_readiness_v4_fix.sql','utf8').toLowerCase();
const gate=fs.readFileSync('supabase/migrations/20260910212000_whatsapp_flow_v31_nfm_replay_readiness_v4.sql','utf8').toLowerCase();
const must=(body,text,label)=>{if(!body.includes(text))throw new Error(`missing:${label}`)};
const mustNot=(body,text,label)=>{if(body.includes(text))throw new Error(`forbidden:${label}`)};

must(edge,'raw.interactive_type==="nfm_reply"','nfm_reply_branch');
must(edge,'process_whatsapp_flow_nfm_reply_v1','deterministic_nfm_rpc');
must(edge,'flowReply?.duplicate===true||!clean(flowReply?.reply_text,4096)','duplicate_or_empty_guard');
must(edge,'should_reply:false,reply_type:"none",reply_body:null','silent_duplicate_response');
must(edge,'should_reply:true,reply_type:"text",reply_body:clean(flowReply.reply_text,4096)','fresh_nfm_reply_only');
must(edge,'action:"flow_nfm_reply",ai_job:null','nfm_bypasses_ai_job');

const duplicateBranch=edge.slice(edge.indexOf('if(flowReply?.duplicate===true'),edge.indexOf('return json({...result,flow_reply:flowReply,should_reply:true'));
mustNot(duplicateBranch,'should_reply:true','duplicate_must_never_reply');
mustNot(duplicateBranch,'reply_type:"text"','duplicate_must_never_send_text');

for(const marker of [
  'message_id_dedupe_present','duplicate_suppresses_location','duplicate_suppresses_reply_text',
  'confirmed_order_guard_present','return_to_chat_explicit','v31_definition_supported'
]) must(migration,marker,marker);

must(gate,'get_whatsapp_flow_v31_full_release_readiness_v4','full_release_v4');
must(gate,"'silent_nfm_replay_contract'",'silent_replay_wired_into_release_gate');
must(gate,"'writes_executed',false",'gate_is_read_only');
must(gate,"'orders_created',false",'gate_creates_no_orders');

for(const unsafe of [
  'whatsapp_live_canary_percent=100','whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true','whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true','whatsapp_flow_commercial_write_enabled=true','bling_order_sync_enabled=true'
]) mustNot((migration+'\n'+gate),unsafe,unsafe);

console.log('WhatsApp Flow V31 nfm replay contract OK: fresh replies are deterministic, duplicates are silent, AI is bypassed, and release gates remain closed.');
