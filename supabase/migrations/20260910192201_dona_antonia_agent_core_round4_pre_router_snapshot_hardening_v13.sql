begin;

create or replace function public.get_agent_core_round4_pre_router_snapshot_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_trigger boolean:=false;
  v_after_release boolean:=false;
  v_before_first_commercial boolean:=false;
  v_pii_payload_columns integer:=0;
  v_rows integer:=0;
begin
  select exists(
    select 1 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_jobs' and tg.tgname='a0z_agent_core_pre_router_state_v1' and not tg.tgisinternal
  ) into v_trigger;

  v_after_release:='a0_whatsapp_release_gate_v1' < 'a0z_agent_core_pre_router_state_v1';
  v_before_first_commercial:='a0z_agent_core_pre_router_state_v1' < 'a1_whatsapp_simple_product_query_v1';

  select count(*)::integer into v_pii_payload_columns
  from information_schema.columns
  where table_schema='public' and table_name='agent_core_pre_router_snapshots'
    and data_type in ('text','character varying','json','jsonb','bytea')
    and lower(column_name) ~ '(body|transcript|phone|telefone|email|cpf|cnpj|address|endereco|customer_name|nome_cliente|customer_id)';

  select count(*)::integer into v_rows from public.agent_core_pre_router_snapshots;

  return jsonb_build_object(
    'version',2,
    'trigger_present',v_trigger,
    'runs_after_release_gate',v_after_release,
    'runs_before_first_commercial_router',v_before_first_commercial,
    'homologation_only',true,
    'fail_open',true,
    'pii_stored',false,
    'pii_payload_columns',v_pii_payload_columns,
    'structural_address_flag_only',true,
    'message_body_stored',false,
    'snapshot_rows',v_rows,
    'ready',v_trigger and v_after_release and v_before_first_commercial and v_pii_payload_columns=0
  );
end
$$;

revoke all on function public.get_agent_core_round4_pre_router_snapshot_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_pre_router_snapshot_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v9()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v8();
  snap jsonb:=public.get_agent_core_round4_pre_router_snapshot_readiness_v1();
begin
  return base || jsonb_build_object(
    'version',9,
    'pre_router_snapshot',snap,
    'pre_router_snapshot_ready',coalesce((snap->>'ready')::boolean,false),
    'stateful_execution_permitted_now',false,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((snap->>'ready')::boolean,false) then 'pre_router_snapshot_not_ready'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v9() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v9() to service_role;

commit;