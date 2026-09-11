create or replace function public.get_whatsapp_flow_v32_live_session_audit_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_cutover_at timestamptz := '2026-09-10 23:24:20.361+00'::timestamptz;
  v_pre_cutover_errors int := 0;
  v_post_cutover_errors int := 0;
  v_post_cutover_replays int := 0;
  v_post_cutover_guards int := 0;
  v_post_cutover_cached int := 0;
  v_post_cutover_uncached int := 0;
  v_current_screen text;
  v_next_expected text;
  v_current_runtime_ok boolean := false;
begin
  v_base := public.get_whatsapp_flow_v31_live_session_audit_v1(p_session_id);

  if not coalesce((v_base->>'pii_returned')::boolean,false)=false then
    return jsonb_build_object('ok',false,'reason','unsafe_base_audit','pii_returned',false,'writes_executed',false);
  end if;

  if coalesce(v_base->>'candidate','') <> 'flow-cestas-comercial-v8-stable' then
    return v_base || jsonb_build_object(
      'audit_version','v32-live-v2',
      'runtime_cutover_at',v_cutover_at,
      'current_runtime_ok',false,
      'writes_executed',false,
      'pii_returned',false
    );
  end if;

  select
    count(*) filter(where (status<>'accepted' or error_code is not null) and created_at < v_cutover_at)::int,
    count(*) filter(where (status<>'accepted' or error_code is not null) and created_at >= v_cutover_at)::int,
    count(*) filter(where coalesce(is_replay,false) and created_at >= v_cutover_at)::int
  into v_pre_cutover_errors,v_post_cutover_errors,v_post_cutover_replays
  from public.whatsapp_flow_exchange_events
  where session_id=p_session_id;

  select
    count(*)::int,
    count(*) filter(where response_payload is not null and response_cached_at is not null)::int,
    count(*) filter(where response_payload is null or response_cached_at is null)::int
  into v_post_cutover_guards,v_post_cutover_cached,v_post_cutover_uncached
  from public.whatsapp_flow_request_guard
  where session_id=p_session_id
    and first_seen_at >= v_cutover_at;

  v_current_screen := nullif(v_base->>'current_screen','');
  v_next_expected := case
    when coalesce(v_base->>'session_status','') in ('completed','closed') then 'NFM_REPLY_OR_LOCATION'
    when coalesce((v_base->>'init_count')::int,0)=0 and not coalesce((v_base->>'opened')::boolean,false) then 'OPEN_FLOW'
    when coalesce((v_base->>'init_count')::int,0)=0 then 'INIT'
    when v_current_screen is null then 'CESTAS'
    when v_current_screen='CESTAS' then 'SELECT_BASKET'
    when v_current_screen='PERSONALIZAR' or v_current_screen like 'PERSONALIZAR_%' then 'CUSTOMIZE_OR_CONTINUE'
    when v_current_screen='AJUSTAR_ITEM' or v_current_screen like 'AJUSTAR_ITEM_%' then 'APPLY_ITEM_QUANTITY'
    when v_current_screen='SECOES' or v_current_screen like 'SECOES_%' then 'SECTION_TERM_DIRECT_SEARCH_OR_FINISH'
    when v_current_screen='TERMOS' or v_current_screen like 'TERMOS_%' then 'SELECT_TERM'
    when v_current_screen='PRODUTOS' or v_current_screen like 'PRODUTOS_%' then 'SELECT_PRODUCT'
    when v_current_screen='PRODUTO' or v_current_screen like 'PRODUTO_%' then 'ADD_PRODUCT'
    when v_current_screen='UPSELL' then 'OPTIONAL_UPSELL_OR_CONTINUE'
    when v_current_screen='REVISAO' then 'REVIEW_AND_CHECKOUT'
    when v_current_screen in ('CLIENTE','CLIENTE_EXISTENTE','CLIENTE_NOVO') then 'CONFIRM_CUSTOMER_ADDRESS'
    when v_current_screen='FINALIZAR' then 'COMPLETE_FLOW'
    else 'AUDIT_SCREEN'
  end;

  v_current_runtime_ok :=
    v_post_cutover_errors=0
    and coalesce((v_base->>'invalid_screen_count')::int,0)=0
    and coalesce((v_base->>'pending_addon_duplicate_free')::boolean,false)
    and coalesce((v_base->>'pending_addon_quantities_valid')::boolean,false)
    and coalesce((v_base->>'pending_addon_stock_valid')::boolean,false);

  return v_base || jsonb_build_object(
    'ok',v_current_runtime_ok,
    'audit_version','v32-live-v2',
    'runtime_cutover_at',v_cutover_at,
    'historical_error_count',v_pre_cutover_errors,
    'post_v32_error_count',v_post_cutover_errors,
    'post_v32_replay_count',v_post_cutover_replays,
    'post_v32_guard_count',v_post_cutover_guards,
    'post_v32_cached_response_count',v_post_cutover_cached,
    'post_v32_uncached_response_count',v_post_cutover_uncached,
    'replay_cache_observed',v_post_cutover_cached>0,
    'replay_cache_coverage_complete',v_post_cutover_guards>0 and v_post_cutover_uncached=0,
    'next_expected',v_next_expected,
    'current_runtime_ok',v_current_runtime_ok,
    'historical_errors_preserved',v_pre_cutover_errors>0,
    'pii_returned',false,
    'writes_executed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v32_live_session_audit_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v32_live_session_audit_v2(uuid) to service_role;
