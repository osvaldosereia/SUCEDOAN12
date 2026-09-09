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
  ) then
    raise exception 'whatsapp_flow_rollout_hard_locked';
  end if;
  return new;
end;
$$;
