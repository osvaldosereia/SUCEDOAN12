create or replace function public.guard_whatsapp_flow_rollout_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    coalesce(new.whatsapp_live_canary_percent,0) > 1
    or coalesce(new.experience_orchestrator_enabled,false)
    or coalesce(new.whatsapp_flow_data_exchange_enabled,false)
    or coalesce(new.whatsapp_flow_send_enabled,false)
    or coalesce(new.whatsapp_flow_commercial_write_enabled,false)
    or coalesce(new.bling_order_sync_enabled,false)
  ) and coalesce(current_setting('app.whatsapp_flow_rollout_authorized', true),'off') <> 'on' then
    raise exception 'whatsapp_flow_rollout_not_authorized';
  end if;
  return new;
end;
$$;

drop trigger if exists automation_config_whatsapp_flow_rollout_guard on public.automation_config;
create trigger automation_config_whatsapp_flow_rollout_guard
before insert or update of whatsapp_live_canary_percent, experience_orchestrator_enabled, whatsapp_flow_data_exchange_enabled, whatsapp_flow_send_enabled, whatsapp_flow_commercial_write_enabled, bling_order_sync_enabled
on public.automation_config
for each row execute function public.guard_whatsapp_flow_rollout_v1();

revoke all on function public.guard_whatsapp_flow_rollout_v1() from public, anon, authenticated;
grant execute on function public.guard_whatsapp_flow_rollout_v1() to service_role;
