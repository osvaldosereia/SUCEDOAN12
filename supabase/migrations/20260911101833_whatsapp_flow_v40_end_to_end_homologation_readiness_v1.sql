-- WhatsApp Flow V40: readiness ponta a ponta owner-only, sem escrita comercial.
-- Consolida busca direta, evidência real segmentada, upsell session-aware e checkout terminal.

create or replace function public.get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_session_id uuid;
  v_session_last_at timestamptz;
  v_direct jsonb;
  v_live jsonb;
  v_upsell jsonb;
  v_terminal jsonb;
  v_ok boolean;
begin
  select e.session_id, max(e.created_at)
    into v_session_id, v_session_last_at
  from public.whatsapp_flow_exchange_events e
  join public.experience_sessions s on s.id=e.session_id
  where e.session_id is not null
    and coalesce((s.context->>'homologation_test')::boolean,false)
    and exists (
      select 1
      from public.whatsapp_flow_exchange_events x
      where x.session_id=e.session_id
        and x.status='accepted'
        and x.screen='PRODUTOS_A'
    )
  group by e.session_id
  order by max(e.created_at) desc
  limit 1;

  v_direct := public.get_whatsapp_flow_v34_direct_search_readiness_v1();
  v_terminal := public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(null);

  if v_session_id is not null then
    v_live := public.get_whatsapp_flow_v37_live_segmented_path_readiness_v1(v_session_id);
    v_upsell := public.get_whatsapp_flow_v35_session_upsell_readiness_v1(v_session_id);
  else
    v_live := jsonb_build_object('ok',false,'reason','no_live_segmented_homologation_evidence');
    v_upsell := jsonb_build_object('ok',false,'reason','no_live_segmented_homologation_evidence');
  end if;

  v_ok := coalesce((v_direct->>'ok')::boolean,false)
    and coalesce((v_live->>'ok')::boolean,false)
    and coalesce((v_upsell->>'ok')::boolean,false)
    and coalesce((v_terminal->>'ok')::boolean,false)
    and coalesce((v_live->>'full_catalog_loaded')::boolean,false)=false
    and coalesce((v_live->>'catalog_page_limit_respected')::boolean,false)
    and coalesce((v_upsell->>'optional_upsell')::boolean,false)
    and coalesce((v_upsell->>'ai_authoritative_for_products')::boolean,true)=false
    and coalesce((v_direct->>'ai_authoritative_for_catalog')::boolean,true)=false;

  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v40-end-to-end-homologation-v1',
    'evidence_session_id',v_session_id,
    'evidence_last_at',v_session_last_at,
    'direct_intent_search_ready',coalesce((v_direct->>'ok')::boolean,false),
    'live_segmented_path_ready',coalesce((v_live->>'ok')::boolean,false),
    'session_aware_upsell_ready',coalesce((v_upsell->>'ok')::boolean,false),
    'terminal_checkout_ready',coalesce((v_terminal->>'ok')::boolean,false),
    'catalog_page_limit_respected',coalesce((v_live->>'catalog_page_limit_respected')::boolean,false),
    'max_products_in_observed_response',coalesce((v_live->>'max_products_in_any_response')::int,0),
    'full_catalog_loaded',false,
    'upsell_optional',coalesce((v_upsell->>'optional_upsell')::boolean,false),
    'ai_authoritative_for_catalog',false,
    'ai_authoritative_for_products',false,
    'writes_executed',false,
    'orders_created',false,
    'pii_returned',false,
    'gates',v_terminal->'gates',
    'components',jsonb_build_object(
      'direct_search',jsonb_build_object('ok',v_direct->'ok','max_products_returned',v_direct->'max_products_returned','hard_page_cap',v_direct->'hard_page_cap'),
      'live_path',jsonb_build_object('ok',v_live->'ok','accepted_exchange_count',v_live->'accepted_exchange_count','error_exchange_count',v_live->'error_exchange_count','all_guards_cached',v_live->'all_guards_cached','observed_screens',v_live->'observed_screens'),
      'upsell',jsonb_build_object('ok',v_upsell->'ok','recommendation_count',v_upsell->'recommendation_count','duplicate_count',v_upsell->'duplicate_count','selected_product_overlap_count',v_upsell->'selected_product_overlap_count'),
      'terminal',jsonb_build_object('ok',v_terminal->'ok','runtime_handler',v_terminal->'runtime_handler','runtime_edge_version',v_terminal->'runtime_edge_version')
    )
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v40_end_to_end_homologation_readiness_v1() to service_role;
