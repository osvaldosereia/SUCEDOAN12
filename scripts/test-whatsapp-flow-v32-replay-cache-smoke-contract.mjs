import fs from 'node:fs';

const path='supabase/migrations/20260911002000_whatsapp_flow_v32_replay_cache_transactional_smoke_v2.sql';
const sql=fs.readFileSync(path,'utf8');
const must=(needle,label)=>{if(!sql.includes(needle))throw new Error(`V32 smoke missing ${label}: ${needle}`)};
const mustNot=(needle,label)=>{if(sql.includes(needle))throw new Error(`V32 smoke forbidden ${label}: ${needle}`)};

must('get_whatsapp_flow_v32_replay_cache_smoke_v2','smoke_rpc');
must('cache_whatsapp_flow_response_v1(v_fp,v_first)','first_cache');
must('cache_whatsapp_flow_response_v1(v_fp,v_second)','second_cache');
must('get_whatsapp_flow_replay_response_v1(v_fp)','replay_reader');
must("if v_stored is distinct from v_first then raise exception 'first_response_not_immutable'",'first_response_wins');
must("if (v_replay->'response') is distinct from v_first then raise exception 'replay_response_mismatch'",'reader_returns_first');
must("delete from public.whatsapp_flow_request_guard where request_fingerprint=v_fp",'cleanup');
must("'synthetic_guard_cleaned',true",'cleanup_report');
must("'commercial_writes_executed',false",'no_commercial_writes');
must("'pii_returned',false",'no_pii');
must('revoke all on function public.get_whatsapp_flow_v32_replay_cache_smoke_v2() from public,anon,authenticated','service_role_only_revoke');
must('grant execute on function public.get_whatsapp_flow_v32_replay_cache_smoke_v2() to service_role','service_role_only_grant');

mustNot('update public.automation_config','gate_mutation');
mustNot('insert into public.orders','order_write');
mustNot('insert into public.cart','cart_write');
mustNot('whatsapp_flow_send_enabled=true','flow_send_activation');
mustNot('whatsapp_flow_data_exchange_enabled=true','data_exchange_activation');
mustNot('whatsapp_flow_commercial_write_enabled=true','commercial_write_activation');
mustNot('bling_order_sync_enabled=true','bling_activation');

console.log('OK WhatsApp Flow V32 replay cache smoke contract');
