begin;

create or replace function public.get_whatsapp_flow_v69_visual_product_card_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  t record;
  r jsonb;
  p jsonb;
  v_terms_checked integer:=0;
  v_cards_checked integer:=0;
  v_terms_with_products integer:=0;
  v_missing_id integer:=0;
  v_missing_name integer:=0;
  v_missing_price integer:=0;
  v_missing_image integer:=0;
  v_bad_image_scheme integer:=0;
  v_over_limit_terms integer:=0;
  v_max_results integer:=0;
  v_count integer:=0;
  v_ok boolean:=false;
begin
  select * into cfg from public.automation_config where id=1;
  for t in select term_key,search_query from public.whatsapp_flow_search_terms where enabled order by sort_order,term_title loop
    v_terms_checked:=v_terms_checked+1;
    r:=public.get_whatsapp_flow_product_results_v1(t.search_query,20);
    v_count:=jsonb_array_length(coalesce(r->'products','[]'::jsonb));
    v_max_results:=greatest(v_max_results,v_count);
    if v_count>0 then v_terms_with_products:=v_terms_with_products+1; end if;
    if v_count>20 then v_over_limit_terms:=v_over_limit_terms+1; end if;
    for p in select value from jsonb_array_elements(coalesce(r->'products','[]'::jsonb)) loop
      v_cards_checked:=v_cards_checked+1;
      if nullif(trim(coalesce(p->>'id','')),'') is null then v_missing_id:=v_missing_id+1; end if;
      if nullif(trim(coalesce(p->>'name','')),'') is null then v_missing_name:=v_missing_name+1; end if;
      if coalesce(nullif(trim(p->>'price'),''),'0')::numeric<=0 then v_missing_price:=v_missing_price+1; end if;
      if nullif(trim(coalesce(p->>'image_url','')),'') is null then
        v_missing_image:=v_missing_image+1;
      elsif lower(p->>'image_url') !~ '^https://' then
        v_bad_image_scheme:=v_bad_image_scheme+1;
      end if;
    end loop;
  end loop;
  v_ok:=v_terms_checked>0 and v_terms_with_products>0 and v_cards_checked>0
    and v_missing_id=0 and v_missing_name=0 and v_missing_price=0 and v_missing_image=0
    and v_bad_image_scheme=0 and v_over_limit_terms=0 and v_max_results<=20
    and cfg.whatsapp_live_canary_percent=1
    and not cfg.experience_orchestrator_enabled
    and not cfg.whatsapp_flow_data_exchange_enabled
    and not cfg.whatsapp_flow_send_enabled
    and not cfg.whatsapp_flow_commercial_write_enabled
    and not cfg.bling_order_sync_enabled;
  return jsonb_build_object(
    'ok',v_ok,'readiness_version','v69-visual-product-card-readiness-v1',
    'terms_checked',v_terms_checked,'terms_with_products',v_terms_with_products,
    'product_cards_checked',v_cards_checked,'missing_id_count',v_missing_id,
    'missing_name_count',v_missing_name,'missing_or_zero_price_count',v_missing_price,
    'missing_image_count',v_missing_image,'non_https_image_count',v_bad_image_scheme,
    'terms_over_20_products_count',v_over_limit_terms,'max_results_seen',v_max_results,
    'max_products_per_query',20,'full_catalog_loaded',false,'component_prices_visible',false,
    'extras_price_visible',true,'product_images_required',true,'writes_performed',false,
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
revoke all on function public.get_whatsapp_flow_v69_visual_product_card_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v69_visual_product_card_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v10(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v9 jsonb; v69 jsonb; v_ok boolean;
begin
  v9:=public.get_whatsapp_flow_owner_homologation_preflight_v9(p_conversation_id);
  v69:=public.get_whatsapp_flow_v69_visual_product_card_readiness_v1();
  v_ok:=coalesce((v9->>'ok')::boolean,false) and coalesce((v69->>'ok')::boolean,false);
  return v9||jsonb_build_object(
    'ok',v_ok,'preflight_version','v10-v69-visual-product-card-readiness',
    'visual_product_card_ready',coalesce((v69->>'ok')::boolean,false),
    'product_cards_checked',coalesce((v69->>'product_cards_checked')::integer,0),
    'missing_image_count',coalesce((v69->>'missing_image_count')::integer,0),
    'missing_or_zero_price_count',coalesce((v69->>'missing_or_zero_price_count')::integer,0),
    'max_results_seen',coalesce((v69->>'max_results_seen')::integer,0),'writes_performed',false);
end;
$function$;
revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v10(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v10(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(
  p_conversation_id uuid,p_idempotency_key text,p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare preflight jsonb; result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v13'));
  preflight:=public.get_whatsapp_flow_owner_homologation_preflight_v10(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','owner_conversation_preflight_v10_failed','preflight',preflight,'dispatch_version','v13-v69-visual-readiness-runtime-v26-edge49');
  end if;
  result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(p_conversation_id,p_idempotency_key,p_body_text);
  return result||jsonb_build_object('preflight_v10',preflight,'serialized_launch',true,'runtime_handler','v26','edge_version',49,'dispatch_version','v13-v69-visual-readiness-runtime-v26-edge49');
end;
$function$;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v69_homologation_control_plane_v1()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  base jsonb; visual jsonb; eligible_count integer:=0; active_count integer:=0;
  evidence_ok boolean:=false; contamination boolean:=false; v12_disabled boolean:=false;
  v13_exists boolean:=false; safe_v13 boolean:=false; next_action text;
begin
  base:=public.get_whatsapp_flow_v68_homologation_control_plane_v1();
  visual:=public.get_whatsapp_flow_v69_visual_product_card_readiness_v1();
  eligible_count:=coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count:=coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok:=coalesce((base->>'physical_evidence_ok')::boolean,false);
  contamination:=coalesce((base->>'order_contamination_detected')::boolean,false);
  v13_exists:=to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text)') is not null;
  v12_disabled:=not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v12(uuid,text,text)','EXECUTE');
  safe_v13:=coalesce((base->>'launch_readiness_ok')::boolean,false) and coalesce((visual->>'ok')::boolean,false)
    and not evidence_ok and not contamination and eligible_count=1 and active_count=0 and v13_exists and v12_disabled;
  if contamination then next_action:='investigate_physical_order_contamination';
  elsif evidence_ok then next_action:='physical_terminal_no_order_evidence_complete';
  elsif not coalesce((visual->>'ok')::boolean,false) then next_action:='fix_visual_product_card_readiness';
  elsif not v12_disabled then next_action:='disable_legacy_owner_launcher_v12';
  elsif active_count>0 then next_action:='continue_existing_owner_homologation_session';
  elsif eligible_count=0 then next_action:='wait_for_owner_service_window';
  elsif eligible_count=1 then next_action:='owner_conversation_ready_for_v13';
  else next_action:='select_one_owner_conversation_explicitly'; end if;
  return base||jsonb_build_object(
    'visual_product_card_ready',coalesce((visual->>'ok')::boolean,false),
    'visual_readiness_version',visual->>'readiness_version','product_cards_checked',visual->'product_cards_checked',
    'missing_image_count',visual->'missing_image_count','missing_or_zero_price_count',visual->'missing_or_zero_price_count',
    'max_results_seen',visual->'max_results_seen','safe_to_launch_owner_v12',false,'safe_to_launch_owner_v13',safe_v13,
    'direct_v12_service_role_disabled',v12_disabled,'launcher_preflight_version','v10-v69-visual-product-card-readiness',
    'dispatch_version','v13-v69-visual-readiness-runtime-v26-edge49','next_action',next_action,
    'writes_performed',false,'control_plane_version','v69-visual-product-card-readiness');
end;
$function$;
revoke all on function public.get_whatsapp_flow_v69_homologation_control_plane_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v69_homologation_control_plane_v1() to service_role;

commit;
