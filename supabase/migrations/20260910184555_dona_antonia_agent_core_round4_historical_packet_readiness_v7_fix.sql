begin;

create or replace function public.get_agent_core_round4_historical_packet_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with candidates as (
  select j.id,j.conversation_id,j.message_id,
         public.is_agent_core_stateless_historical_replay_job_v3(j.id) safety
  from public.ai_jobs j
  join public.conversations c on c.id=j.conversation_id
  where j.status='done' and j.job_type='conversation'
    and c.automation_cohort='homologation'
    and j.created_at>=now()-interval '7 days'
), picked as (
  select distinct on (safety->>'allowed_tool_family')
         id,conversation_id,message_id,safety
  from candidates
  where coalesce((safety->>'safe')::boolean,false)
    and safety->>'allowed_tool_family' in ('catalog_search','basket_catalog')
  order by safety->>'allowed_tool_family',id
), packets as (
  select p.*,public.build_whatsapp_agent_core_packet_v1(p.conversation_id,p.message_id) packet
  from picked p
), checks as (
  select safety->>'allowed_tool_family' family,
         safety->>'resolved_topic' expected_topic,
         packet->>'topic' actual_topic,
         coalesce((packet#>>'{metadata,historical_replay}')::boolean,false) historical_replay,
         coalesce((packet#>>'{metadata,historical_state_neutral}')::boolean,false) state_neutral,
         coalesce(packet#>>'{conversation,stage}','')='' stage_blank,
         coalesce(packet->'sales_state','{}'::jsonb)='{}'::jsonb sales_state_empty,
         coalesce(packet->'customer','null'::jsonb)='null'::jsonb customer_absent,
         coalesce(packet#>>'{cart,exists}','false')='false' cart_empty,
         coalesce(jsonb_array_length(packet->'history'),0)=0 history_omitted,
         coalesce(jsonb_array_length(packet->'customer_memory'),0)=0 customer_memory_omitted,
         coalesce(packet->>'conversation_summary','')='' summary_omitted,
         not exists(
           select 1 from jsonb_array_elements(coalesce(packet->'toolset','[]'::jsonb)) t
           where case when safety->>'allowed_tool_family'='catalog_search'
             then t->>'name' not in ('wa_search_products','wa_get_product','wa_get_policy')
             else t->>'name' not in ('wa_list_baskets','wa_get_policy') end
         ) toolset_restricted
  from packets
)
select jsonb_build_object(
  'version',2,
  'families_checked',(select count(*) from checks),
  'catalog_search_present',exists(select 1 from checks where family='catalog_search'),
  'basket_catalog_present',exists(select 1 from checks where family='basket_catalog'),
  'topic_matches',not exists(select 1 from checks where actual_topic<>expected_topic),
  'historical_replay_marked',not exists(select 1 from checks where not historical_replay),
  'state_neutral',not exists(select 1 from checks where not state_neutral or not stage_blank or not sales_state_empty or not customer_absent or not cart_empty or not history_omitted or not customer_memory_omitted or not summary_omitted),
  'toolset_restricted',not exists(select 1 from checks where not toolset_restricted),
  'ready',(
    (select count(*) from checks)=2
    and not exists(select 1 from checks where actual_topic<>expected_topic)
    and not exists(select 1 from checks where not historical_replay or not state_neutral or not stage_blank or not sales_state_empty or not customer_absent or not cart_empty or not history_omitted or not customer_memory_omitted or not summary_omitted or not toolset_restricted)
  )
); $$;

revoke all on function public.get_agent_core_round4_historical_packet_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_historical_packet_readiness_v1() to service_role;

commit;