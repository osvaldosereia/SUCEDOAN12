import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910230600_whatsapp_flow_replay_response_cache_v32.sql','utf8');
const edge=fs.readFileSync('supabase/functions/whatsapp-flow-data-exchange-v1/index.ts','utf8');
const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(`V32 missing ${label}: ${needle}`)};
const mustNot=(src,needle,label)=>{if(src.includes(needle))throw new Error(`V32 forbidden ${label}: ${needle}`)};

must(migration,'response_payload jsonb','response_payload_column');
must(migration,'response_cached_at timestamptz','response_cached_at_column');
must(migration,'cache_whatsapp_flow_response_v1','cache_rpc');
must(migration,'get_whatsapp_flow_replay_response_v1','replay_reader_rpc');
must(migration,"response_payload=coalesce(response_payload,v_response)",'first_response_immutable');
must(migration,"grant execute on function public.cache_whatsapp_flow_response_v1(text,jsonb) to service_role",'cache_service_role_only');
must(migration,"grant execute on function public.get_whatsapp_flow_replay_response_v1(text) to service_role",'reader_service_role_only');
must(migration,"'commercial_writes_permitted',false",'no_commercial_writes');

must(edge,'async function loadReplayResponse','edge_replay_loader');
must(edge,'get_whatsapp_flow_replay_response_v1','edge_replay_reader');
must(edge,'cache_whatsapp_flow_response_v1','edge_cache_writer');
must(edge,'if(action!=="ping"&&isReplay)','replay_short_circuit');
must(edge,'flow_replay_response_pending','replay_race_fail_safe');
must(edge,'requiredResponseScreen','response_screen_validator');
must(edge,'flow_response_screen_missing','screen_fail_closed');
must(edge,'response={screen:responseScreen,data:{error:true,error_code:errorCode,replayed:false}}','rejected_response_has_screen');
must(edge,'response=await hydrateExperienceImagesWithCards(cached,url,resolvedDefinitionSlug||null)','cached_response_rehydrated');
must(edge,'if(action!=="ping"&&!isReplay&&responseForCache)await cacheFlowResponse','cache_only_first_execution');

const replayPos=edge.indexOf('if(action!=="ping"&&isReplay)');
const stableHandlerPos=edge.indexOf('handle_whatsapp_flow_commercial_exchange_v24');
if(replayPos<0||stableHandlerPos<0||replayPos>stableHandlerPos)throw new Error('V32 replay must short-circuit before commercial handler');

mustNot(edge,'response={data:{error:true,error_code:errorCode,replayed:isReplay}}','screenless_rejection');
mustNot(migration,'whatsapp_live_canary_percent=','canary_change');
mustNot(migration,'whatsapp_flow_send_enabled=','flow_send_activation');
mustNot(migration,'whatsapp_flow_data_exchange_enabled=','data_exchange_activation');
mustNot(migration,'whatsapp_flow_commercial_write_enabled=','commercial_write_activation');
mustNot(migration,'bling_order_sync_enabled=','bling_activation');

console.log('OK WhatsApp Flow V32 replay idempotency contract');
