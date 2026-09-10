begin;

create or replace function public.observe_whatsapp_agent_core_turn_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p jsonb; cfg public.agent_core_runtime_config%rowtype; keys text[]='{}'::text[]; bytes integer:=0;
  hist_count integer:=0; knowledge_count integer:=0; guidance_count integer:=0; procedure_count integer:=0;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('observed',false,'reason','agent_core_disabled'); end if;
  p:=public.build_whatsapp_agent_core_packet_v1(p_conversation_id,p_message_id);
  select coalesce(array_agg(x->>'name' order by x->>'name'),'{}'::text[]) into keys from jsonb_array_elements(coalesce(p->'toolset','[]'::jsonb)) x;
  bytes:=octet_length(p::text);
  hist_count:=jsonb_array_length(coalesce(p->'history','[]'::jsonb));
  knowledge_count:=jsonb_array_length(coalesce(p#>'{intelligence,knowledge}','[]'::jsonb));
  guidance_count:=jsonb_array_length(coalesce(p#>'{intelligence,guidance}','[]'::jsonb));
  procedure_count:=jsonb_array_length(coalesce(p#>'{intelligence,procedures}','[]'::jsonb));
  insert into public.agent_core_turns(conversation_id,message_id,agent_version,execution_mode,topic,tool_keys,status,context_bytes,metadata)
  values(p_conversation_id,p_message_id,cfg.agent_version,cfg.execution_mode,p->>'topic',keys,'observed',bytes,jsonb_build_object('history_count',hist_count,'knowledge_count',knowledge_count,'guidance_count',guidance_count,'procedure_count',procedure_count,'prompt_stored',false))
  on conflict(message_id,agent_version,execution_mode) do update set topic=excluded.topic,tool_keys=excluded.tool_keys,status='observed',context_bytes=excluded.context_bytes,metadata=excluded.metadata;
  return jsonb_build_object('observed',true,'agent_version',cfg.agent_version,'execution_mode',cfg.execution_mode,'topic',p->>'topic','tool_count',cardinality(keys),'context_bytes',bytes,'history_count',hist_count,'knowledge_count',knowledge_count,'guidance_count',guidance_count,'procedure_count',procedure_count);
end $$;
revoke all on function public.observe_whatsapp_agent_core_turn_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.observe_whatsapp_agent_core_turn_v1(uuid,uuid) to service_role;

create or replace function public.get_whatsapp_agent_core_readiness_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.agent_core_runtime_config%rowtype; tool_count integer; before_router_count integer; open_handoff_count integer;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  select count(*) into tool_count from public.ai_action_registry a where a.enabled and a.execution_mode<>'off' and a.metadata->>'agent_core'='v1' and coalesce((a.metadata->>'tool')::boolean,false);
  select count(*) into before_router_count from pg_trigger t where t.tgrelid='public.ai_jobs'::regclass and not t.tgisinternal and position('BEFORE INSERT' in pg_get_triggerdef(t.oid))>0;
  select count(*) into open_handoff_count from public.human_handoffs where status='open';
  return jsonb_build_object('enabled',coalesce(cfg.enabled,false),'execution_mode',coalesce(cfg.execution_mode,'off'),'agent_version',cfg.agent_version,'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,'tool_count',tool_count,'legacy_before_insert_router_count',before_router_count,'legacy_router_policy',cfg.legacy_router_policy,'open_handoffs',open_handoff_count,'memory_read_enabled',cfg.memory_read_enabled,'learning_write_enabled',cfg.learning_write_enabled,'ready_for_shadow',coalesce(cfg.enabled,false) and cfg.execution_mode='observe' and tool_count>=10);
end $$;
revoke all on function public.get_whatsapp_agent_core_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_agent_core_readiness_v1() to service_role;

commit;