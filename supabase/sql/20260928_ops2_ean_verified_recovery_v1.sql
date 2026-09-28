create or replace function public.dispatch_bling_hub_cycle_v2()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request_id bigint;
  v_ean_recovery_id bigint;
begin
  if not exists(
    select 1
    from public.bling_hub_runtime_v2
    where id=1
      and hub_enabled=true
      and mode in ('homologation','live')
  ) then
    return null;
  end if;

  select net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
    ),
    body := jsonb_build_object(
      'action','vitrine_bling_hub_internal',
      'subaction','process_cycle',
      'limit',3
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  select net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1?action=ops2_recover_ean_verified',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dona-antonia-bling-hub-key',public.get_bling_hub_key_v2()
    ),
    body := jsonb_build_object('limit',3),
    timeout_milliseconds := 55000
  ) into v_ean_recovery_id;

  return v_request_id;
end;
$function$;
