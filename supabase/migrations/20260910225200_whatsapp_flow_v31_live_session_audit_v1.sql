create or replace function public.get_whatsapp_flow_v31_live_session_audit_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_events jsonb := '[]'::jsonb;
  v_event_count int := 0;
  v_error_count int := 0;
  v_replay_count int := 0;
  v_invalid_screen_count int := 0;
  v_init_count int := 0;
  v_pending jsonb := '[]'::jsonb;
  v_pending_rows int := 0;
  v_pending_distinct int := 0;
  v_pending_invalid_qty int := 0;
  v_pending_stock_invalid int := 0;
  v_preview jsonb := '{}'::jsonb;
  v_preview_ok boolean := false;
  v_next_expected text := 'OPEN_FLOW';
  v_allowed text[] := array[
    'CESTAS','PERSONALIZAR_A','AJUSTAR_ITEM_A','PERSONALIZAR_B','AJUSTAR_ITEM_B',
    'PERSONALIZAR_C','AJUSTAR_ITEM_C','SECOES_A','TERMOS_A','PRODUTOS_A','PRODUTO_A',
    'SECOES_B','TERMOS_B','PRODUTOS_B','PRODUTO_B','SECOES_C','TERMOS_C','PRODUTOS_C',
    'PRODUTO_C','UPSELL','REVISAO','CLIENTE_EXISTENTE','CLIENTE_NOVO','FINALIZAR'
  ];
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','session_not_found','pii_returned',false,'writes_executed',false);
  end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if not found or d.slug<>'flow-cestas-comercial-v8-stable' then
    return jsonb_build_object('ok',false,'reason','not_v31_stable_candidate','pii_returned',false,'writes_executed',false);
  end if;

  select count(*)::int,
         count(*) filter(where status<>'accepted' or error_code is not null)::int,
         count(*) filter(where coalesce(is_replay,false))::int,
         count(*) filter(where screen is not null and not (screen=any(v_allowed)))::int,
         count(*) filter(where lower(coalesce(action,''))='init')::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'action',left(coalesce(action,''),40),
           'screen',case when screen is null then null else left(screen,40) end,
           'status',left(coalesce(status,''),30),
           'replay',coalesce(is_replay,false),
           'error',error_code is not null
         ) order by created_at,id),'[]'::jsonb)
    into v_event_count,v_error_count,v_replay_count,v_invalid_screen_count,v_init_count,v_events
    from public.whatsapp_flow_exchange_events
   where session_id=p_session_id;

  v_pending:=case when jsonb_typeof(s.context->'flow_pending_addons')='array'
                  then s.context->'flow_pending_addons' else '[]'::jsonb end;

  select count(*)::int,
         count(distinct nullif(e->>'product_id',''))::int,
         count(*) filter(where coalesce(e->>'quantity','') !~ '^[1-6]$')::int
    into v_pending_rows,v_pending_distinct,v_pending_invalid_qty
    from jsonb_array_elements(v_pending) e;

  select count(*)::int into v_pending_stock_invalid
    from jsonb_array_elements(v_pending) e
    left join public.products p
      on coalesce(e->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and p.id=(e->>'product_id')::uuid
   where p.id is null
      or p.is_active is not true
      or coalesce(p.is_whatsapp_active,false) is not true
      or coalesce(p.price,0)<=0
      or coalesce(p.stock,0)<coalesce(nullif(e->>'quantity','')::int,0);

  if s.context ? 'flow_basket_selection' then
    begin
      v_preview:=public.format_whatsapp_flow_session_preview_v2(p_session_id);
      v_preview_ok:=coalesce((v_preview->>'ok')::boolean,false);
    exception when others then
      v_preview:='{}'::jsonb;
      v_preview_ok:=false;
    end;
  end if;

  v_next_expected:=case
    when s.status in ('completed','closed') then 'NFM_REPLY_OR_LOCATION'
    when v_init_count=0 and s.opened_at is null then 'OPEN_FLOW'
    when v_init_count=0 then 'INIT'
    when s.flow_current_screen is null then 'CESTAS'
    when s.flow_current_screen='CESTAS' then 'SELECT_BASKET'
    when s.flow_current_screen like 'PERSONALIZAR_%' then 'CUSTOMIZE_OR_CONTINUE'
    when s.flow_current_screen like 'AJUSTAR_ITEM_%' then 'APPLY_ITEM_QUANTITY'
    when s.flow_current_screen like 'SECOES_%' then 'SECTION_TERM_DIRECT_SEARCH_OR_FINISH'
    when s.flow_current_screen like 'TERMOS_%' then 'SELECT_TERM'
    when s.flow_current_screen like 'PRODUTOS_%' then 'SELECT_PRODUCT'
    when s.flow_current_screen like 'PRODUTO_%' then 'ADD_PRODUCT'
    when s.flow_current_screen='UPSELL' then 'OPTIONAL_UPSELL_OR_CONTINUE'
    when s.flow_current_screen='REVISAO' then 'REVIEW_AND_CHECKOUT'
    when s.flow_current_screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO') then 'CONFIRM_CUSTOMER_ADDRESS'
    when s.flow_current_screen='FINALIZAR' then 'COMPLETE_FLOW'
    else 'AUDIT_SCREEN'
  end;

  return jsonb_build_object(
    'ok',v_error_count=0 and v_invalid_screen_count=0 and v_pending_rows=v_pending_distinct
         and v_pending_invalid_qty=0 and v_pending_stock_invalid=0,
    'candidate','flow-cestas-comercial-v8-stable',
    'session_status',s.status,
    'opened',s.opened_at is not null,
    'current_screen',s.flow_current_screen,
    'state_version',coalesce(s.flow_state_version,0),
    'session_exchange_count',coalesce(s.flow_exchange_count,0),
    'observed_exchange_count',v_event_count,
    'init_count',v_init_count,
    'error_count',v_error_count,
    'replay_count',v_replay_count,
    'invalid_screen_count',v_invalid_screen_count,
    'pending_addon_rows',v_pending_rows,
    'pending_addon_distinct_products',v_pending_distinct,
    'pending_addon_duplicate_free',v_pending_rows=v_pending_distinct,
    'pending_addon_quantities_valid',v_pending_invalid_qty=0,
    'pending_addon_stock_valid',v_pending_stock_invalid=0,
    'preview_available',v_preview_ok,
    'preview_total',case when v_preview_ok then v_preview->>'total' else null end,
    'next_expected',v_next_expected,
    'visual_homologation_complete',s.status in ('completed','closed') and s.flow_current_screen='FINALIZAR',
    'events',v_events,
    'pii_returned',false,
    'writes_executed',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_live_session_audit_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_live_session_audit_v1(uuid) to service_role;
