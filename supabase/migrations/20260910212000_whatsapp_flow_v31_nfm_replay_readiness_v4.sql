begin;

create or replace function public.get_whatsapp_flow_v31_nfm_replay_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  terminal jsonb:=public.get_whatsapp_flow_v31_terminal_readiness_v1();
  wrapper text:=lower(coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)'::regprocedure),''));
  legacy text:=lower(coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_legacy_v1(uuid,uuid,jsonb)'::regprocedure),''));
  checks jsonb;
  ok boolean;
begin
  select jsonb_agg(jsonb_build_object('name',x.name,'ok',x.ok) order by x.ord), bool_and(x.ok)
  into checks,ok
  from (values
    (1,'terminal_readiness_green',coalesce((terminal->>'ok')::boolean,false)),
    (2,'wrapper_routes_commercial_bridge',position('process_whatsapp_flow_nfm_reply_legacy_v1' in wrapper)>0),
    (3,'message_id_dedupe_present',position("event_type='flow_nfm_reply'" in replace(legacy,' ',''))>0 and position('v_duplicate' in legacy)>0),
    (4,'duplicate_suppresses_location',position("'location_required',(v_order_id is not null and not v_duplicate)" in legacy)>0),
    (5,'duplicate_suppresses_reply_text',position('case when v_duplicate then null' in legacy)>0),
    (6,'confirmed_order_guard_present',position("status='confirmed'" in replace(legacy,' ',''))>0 and position('confirmed_at is not null' in legacy)>0 and position('coalesce(total,0)>0' in replace(legacy,' ',''))>0),
    (7,'return_to_chat_explicit',position("'return_to_chat',true" in replace(legacy,' ',''))>0),
    (8,'v31_definition_supported',position('flow-cestas-comercial-v8-stable' in legacy)>0)
  ) as x(ord,name,ok);

  return jsonb_build_object(
    'ok',coalesce(ok,false),
    'version','v1-silent-nfm-replay',
    'checks',coalesce(checks,'[]'::jsonb),
    'terminal',terminal,
    'writes_executed',false,
    'orders_created',false,
    'pii_returned',false
  );
end
$$;

revoke all on function public.get_whatsapp_flow_v31_nfm_replay_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_nfm_replay_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v4(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_whatsapp_flow_v31_full_release_readiness_v3(p_session_id);
  replay jsonb:=public.get_whatsapp_flow_v31_nfm_replay_readiness_v1();
  checks jsonb:=coalesce(base->'checks','[]'::jsonb);
  replay_ok boolean:=coalesce((replay->>'ok')::boolean,false);
  passed integer:=coalesce((base->>'passed')::integer,0)+(case when replay_ok then 1 else 0 end);
  total integer:=coalesce((base->>'total')::integer,0)+1;
  healthy boolean:=coalesce((base->>'healthy')::boolean,false) and replay_ok;
begin
  checks:=checks||jsonb_build_array(jsonb_build_object('name','silent_nfm_replay_contract','ok',replay_ok));
  return base || jsonb_build_object(
    'version','v4-with-silent-nfm-replay',
    'checks',checks,
    'passed',passed,
    'total',total,
    'healthy',healthy,
    'ok',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'nfm_replay',replay,
    'writes_executed',false,
    'orders_created',false
  );
end
$$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v4(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v4(uuid) to service_role;

commit;
