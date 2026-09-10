create or replace function public.guard_whatsapp_flow_rollout_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_flow_authorized boolean:=false;
  v_bling_authorized boolean:=false;
  v_v31_homologation_locked boolean:=false;
begin
  select exists(
    select 1 from public.experience_definitions d
    where d.slug='flow-cestas-comercial-v8-stable'
      and coalesce((d.metadata->>'candidate_not_live')::boolean,false)
      and not coalesce((d.metadata->>'customer_exposure')::boolean,false)
  ) into v_v31_homologation_locked;

  if v_v31_homologation_locked and (
    coalesce(new.whatsapp_live_canary_percent,0)>1
    or coalesce(new.experience_orchestrator_enabled,false)
    or coalesce(new.whatsapp_flow_data_exchange_enabled,false)
    or coalesce(new.whatsapp_flow_send_enabled,false)
    or coalesce(new.whatsapp_flow_commercial_write_enabled,false)
  ) then
    raise exception 'whatsapp_flow_v31_homologation_locked';
  end if;

  select exists(
    select 1 from public.experience_definitions d
    where d.slug in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2','flow-cestas-comercial-v3')
      and coalesce((d.metadata->>'owner_authorized_100_percent')::boolean,false)
  ) into v_flow_authorized;

  select exists(
    select 1 from public.experience_definitions d
    where d.slug in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2','flow-cestas-comercial-v3')
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
$function$;
