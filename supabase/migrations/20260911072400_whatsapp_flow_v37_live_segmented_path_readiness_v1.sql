-- WhatsApp Flow V37: readiness da jornada segmentada observada em homologação real.
-- Audita somente evidências existentes; não cria pedido, não altera rollout e não expõe PII.

create or replace function public.get_whatsapp_flow_v37_live_segmented_path_readiness_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  s public.experience_sessions%rowtype;
  cfg public.automation_config%rowtype;
  v_accepted int:=0;
  v_errors int:=0;
  v_guards int:=0;
  v_cached int:=0;
  v_path_ok boolean:=false;
  v_max_products int:=0;
  v_product_detail_ok boolean:=false;
  v_screen_seq text[];
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then return jsonb_build_object('ok',false,'reason','session_not_found'); end if;
  select * into cfg from public.automation_config where id=1;

  select count(*) filter (where status='accepted')::int,
         count(*) filter (where status<>'accepted' or error_code is not null)::int,
         array_agg(coalesce(screen,'INIT') order by created_at)
    into v_accepted,v_errors,v_screen_seq
  from public.whatsapp_flow_exchange_events
  where session_id=p_session_id;

  select count(*)::int,
         count(*) filter (where response_payload is not null and response_cached_at is not null)::int
    into v_guards,v_cached
  from public.whatsapp_flow_request_guard
  where session_id=p_session_id;

  v_path_ok := array_position(v_screen_seq,'CESTAS') is not null
    and array_position(v_screen_seq,'PERSONALIZAR_A') is not null
    and array_position(v_screen_seq,'SECOES_A') is not null
    and array_position(v_screen_seq,'TERMOS_A') is not null
    and array_position(v_screen_seq,'PRODUTOS_A') is not null
    and array_position(v_screen_seq,'CESTAS') < array_position(v_screen_seq,'PERSONALIZAR_A')
    and array_position(v_screen_seq,'PERSONALIZAR_A') < array_position(v_screen_seq,'SECOES_A')
    and array_position(v_screen_seq,'SECOES_A') < array_position(v_screen_seq,'TERMOS_A')
    and array_position(v_screen_seq,'TERMOS_A') < array_position(v_screen_seq,'PRODUTOS_A');

  select coalesce(max(case when jsonb_typeof(response_payload#>'{data,products}')='array'
                           then jsonb_array_length(response_payload#>'{data,products}') else 0 end),0)::int
    into v_max_products
  from public.whatsapp_flow_request_guard
  where session_id=p_session_id;

  select exists(
    select 1 from public.whatsapp_flow_request_guard g
    where g.session_id=p_session_id
      and g.screen='PRODUTOS_A'
      and nullif(g.response_payload#>>'{data,product_id}','') is not null
      and nullif(g.response_payload#>>'{data,product_name}','') is not null
      and nullif(g.response_payload#>>'{data,product_price}','') is not null
  ) into v_product_detail_ok;

  return jsonb_build_object(
    'ok', v_path_ok and v_errors=0 and v_guards>0 and v_cached=v_guards
      and v_max_products between 1 and 20 and v_product_detail_ok
      and cfg.whatsapp_live_canary_percent=1
      and not coalesce(cfg.experience_orchestrator_enabled,false)
      and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(cfg.whatsapp_flow_send_enabled,false)
      and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(cfg.bling_order_sync_enabled,false),
    'readiness_version','v37-live-segmented-path-v1',
    'session_status',s.status,
    'current_screen',s.flow_current_screen,
    'exchange_count',s.flow_exchange_count,
    'accepted_exchange_count',v_accepted,
    'error_exchange_count',v_errors,
    'observed_screens',to_jsonb(v_screen_seq),
    'segmented_path_observed',v_path_ok,
    'request_guard_count',v_guards,
    'cached_guard_count',v_cached,
    'all_guards_cached',(v_guards>0 and v_guards=v_cached),
    'max_products_in_any_response',v_max_products,
    'catalog_page_limit_respected',(v_max_products between 1 and 20),
    'full_catalog_loaded',false,
    'product_detail_valid',v_product_detail_ok,
    'writes_executed',false,
    'pii_returned',false,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled)
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v37_live_segmented_path_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v37_live_segmented_path_readiness_v1(uuid) to service_role;
