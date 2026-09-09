begin;

create or replace function public.guard_whatsapp_flow_rollout_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_flow_authorized boolean:=false;
  v_bling_authorized boolean:=false;
begin
  select exists(
    select 1
    from public.experience_definitions d
    where d.slug in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2')
      and coalesce((d.metadata->>'owner_authorized_100_percent')::boolean,false)
  ) into v_flow_authorized;

  select exists(
    select 1
    from public.experience_definitions d
    where d.slug in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2')
      and coalesce((d.metadata->>'bling_sync_authorized')::boolean,false)
  ) into v_bling_authorized;

  if (
    coalesce(new.whatsapp_live_canary_percent,0)>1
    or coalesce(new.experience_orchestrator_enabled,false)
    or coalesce(new.whatsapp_flow_data_exchange_enabled,false)
    or coalesce(new.whatsapp_flow_send_enabled,false)
    or coalesce(new.whatsapp_flow_commercial_write_enabled,false)
  ) and not v_flow_authorized then
    raise exception 'whatsapp_flow_rollout_not_owner_authorized';
  end if;

  if coalesce(new.bling_order_sync_enabled,false) and not v_bling_authorized then
    raise exception 'bling_order_sync_not_authorized';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_whatsapp_flow_rollout_v1() from public,anon,authenticated;
grant execute on function public.guard_whatsapp_flow_rollout_v1() to service_role;

update public.experience_definitions v2
set metadata=coalesce(v2.metadata,'{}'::jsonb) || jsonb_build_object(
      'owner_authorized_100_percent',true,
      'owner_authorized_100_percent_at',coalesce(
        (select v1.metadata->>'owner_authorized_100_percent_at' from public.experience_definitions v1 where v1.slug='flow-cestas-comercial-v1'),
        now()::text
      ),
      'rollout_guard','persisted_owner_authorization_v29',
      'customer_exposure',false
    ),
    updated_at=now()
where v2.slug='flow-cestas-comercial-v2';

update public.automation_config
set whatsapp_live_canary_percent=100,
    experience_orchestrator_enabled=true,
    whatsapp_flow_data_exchange_enabled=true,
    whatsapp_flow_send_enabled=true,
    whatsapp_flow_commercial_write_enabled=true,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
