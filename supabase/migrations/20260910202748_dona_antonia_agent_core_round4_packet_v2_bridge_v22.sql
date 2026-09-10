begin;

do $$
declare
  v_def text;
begin
  if to_regprocedure('public.build_whatsapp_agent_core_packet_base_v1(uuid,uuid)') is not null then
    raise exception 'agent core packet base already exists';
  end if;
  if to_regprocedure('public.build_whatsapp_agent_core_packet_v1(uuid,uuid)') is null
     or to_regprocedure('public.build_whatsapp_agent_core_packet_v2(uuid,uuid)') is null then
    raise exception 'agent core packet bridge prerequisites missing';
  end if;

  alter function public.build_whatsapp_agent_core_packet_v1(uuid,uuid)
    rename to build_whatsapp_agent_core_packet_base_v1;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='build_whatsapp_agent_core_packet_v2'
    and pg_get_function_identity_arguments(p.oid)='p_conversation_id uuid, p_message_id uuid'
  limit 1;

  if v_def is null or position('public.build_whatsapp_agent_core_packet_v1' in v_def)=0 then
    raise exception 'packet v2 source drift';
  end if;

  v_def:=replace(v_def,'public.build_whatsapp_agent_core_packet_v1','public.build_whatsapp_agent_core_packet_base_v1');
  execute v_def;
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_base_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_base_v1(uuid,uuid) to service_role;

create function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.build_whatsapp_agent_core_packet_v2(p_conversation_id,p_message_id);
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

create or replace function public.get_agent_core_round4_packet_bridge_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_v1 text:='';
  v_v2 text:='';
  v_base text:='';
begin
  select pg_get_functiondef(p.oid) into v_v1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='build_whatsapp_agent_core_packet_v1' limit 1;
  select pg_get_functiondef(p.oid) into v_v2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='build_whatsapp_agent_core_packet_v2' limit 1;
  select pg_get_functiondef(p.oid) into v_base from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='build_whatsapp_agent_core_packet_base_v1' limit 1;
  return jsonb_build_object(
    'version',1,
    'edge_legacy_rpc_name_now_routes_to_v2',position('build_whatsapp_agent_core_packet_v2' in coalesce(v_v1,''))>0,
    'v2_uses_frozen_base',position('build_whatsapp_agent_core_packet_base_v1' in coalesce(v_v2,''))>0 and position('build_whatsapp_agent_core_packet_v1' in coalesce(v_v2,''))=0,
    'frozen_base_present',length(v_base)>0,
    'pre_router_shadow_packet_active',true,
    'write_execution_permitted',false,
    'retirement_authorized',false
  );
end
$$;

revoke all on function public.get_agent_core_round4_packet_bridge_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_packet_bridge_readiness_v1() to service_role;

commit;