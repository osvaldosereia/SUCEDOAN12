begin;

create or replace function public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  s record;
  t record;
  v_sections integer:=0;
  v_visible_terms integer:=0;
  v_hidden_zero_terms integer:=0;
  v_empty_visible_terms integer:=0;
  v_empty_sections integer:=0;
  v_over_10_terms_sections integer:=0;
  v_max_terms integer:=0;
  v_product_count integer:=0;
  v_ok boolean:=false;
begin
  select * into cfg from public.automation_config where id=1;

  select count(*)::int into v_hidden_zero_terms
  from public.whatsapp_flow_search_terms x
  where x.enabled
    and not exists (
      select 1 from public.search_whatsapp_sellable_products_v1(x.search_query,1) p where p.id is not null
    );

  for s in select * from public.get_whatsapp_flow_sections_v1() loop
    v_sections:=v_sections+1;
    v_max_terms:=greatest(v_max_terms,coalesce(s.term_count,0)::int);
    if coalesce(s.term_count,0)=0 then v_empty_sections:=v_empty_sections+1; end if;
    if coalesce(s.term_count,0)>10 then v_over_10_terms_sections:=v_over_10_terms_sections+1; end if;

    for t in select * from public.get_whatsapp_flow_search_terms_v1(s.section_key) loop
      v_visible_terms:=v_visible_terms+1;
      select count(*)::int into v_product_count
      from public.search_whatsapp_sellable_products_v1(t.search_query,1) p
      where p.id is not null;
      if v_product_count=0 then v_empty_visible_terms:=v_empty_visible_terms+1; end if;
    end loop;
  end loop;

  v_ok:=v_sections>0
    and v_visible_terms>0
    and v_empty_visible_terms=0
    and v_empty_sections=0
    and v_over_10_terms_sections=0
    and v_max_terms<=10
    and cfg.whatsapp_live_canary_percent=1
    and not cfg.experience_orchestrator_enabled
    and not cfg.whatsapp_flow_data_exchange_enabled
    and not cfg.whatsapp_flow_send_enabled
    and not cfg.whatsapp_flow_commercial_write_enabled
    and not cfg.bling_order_sync_enabled;

  return jsonb_build_object(
    'ok',v_ok,
    'readiness_version','v70-visible-taxonomy-readiness-v1',
    'visible_sections',v_sections,
    'visible_terms',v_visible_terms,
    'hidden_zero_result_terms',v_hidden_zero_terms,
    'empty_visible_terms',v_empty_visible_terms,
    'empty_visible_sections',v_empty_sections,
    'sections_over_10_terms',v_over_10_terms_sections,
    'max_visible_terms_in_section',v_max_terms,
    'zero_result_terms_hidden',v_empty_visible_terms=0,
    'full_catalog_loaded',false,
    'max_products_per_query',20,
    'ai_authoritative_for_catalog',false,
    'writes_performed',false,
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
revoke all on function public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v11(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v10 jsonb;
  v70 jsonb;
  v_ok boolean;
begin
  v10:=public.get_whatsapp_flow_owner_homologation_preflight_v10(p_conversation_id);
  v70:=public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1();
  v_ok:=coalesce((v10->>'ok')::boolean,false) and coalesce((v70->>'ok')::boolean,false);
  return v10||jsonb_build_object(
    'ok',v_ok,
    'preflight_version','v11-v70-visible-taxonomy-readiness',
    'visible_taxonomy_ready',coalesce((v70->>'ok')::boolean,false),
    'visible_sections',coalesce((v70->>'visible_sections')::integer,0),
    'visible_terms',coalesce((v70->>'visible_terms')::integer,0),
    'empty_visible_terms',coalesce((v70->>'empty_visible_terms')::integer,0),
    'writes_performed',false
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v11(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v11(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  preflight jsonb;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v14'));
  preflight:=public.get_whatsapp_flow_owner_homologation_preflight_v11(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'reason','owner_conversation_preflight_v11_failed',
      'preflight',preflight,
      'dispatch_version','v14-v70-visible-taxonomy-runtime-v26-edge49'
    );
  end if;
  result:=public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(p_conversation_id,p_idempotency_key,p_body_text);
  return result||jsonb_build_object(
    'preflight_v11',preflight,
    'serialized_launch',true,
    'runtime_handler','v26',
    'edge_version',49,
    'dispatch_version','v14-v70-visible-taxonomy-runtime-v26-edge49'
  );
end;
$function$;
revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v70_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  tax jsonb;
  eligible_count integer:=0;
  active_count integer:=0;
  evidence_ok boolean:=false;
  contamination boolean:=false;
  v13_disabled boolean:=false;
  v14_exists boolean:=false;
  safe_v14 boolean:=false;
  next_action text;
begin
  base:=public.get_whatsapp_flow_v69_homologation_control_plane_v1();
  tax:=public.get_whatsapp_flow_v70_visible_taxonomy_readiness_v1();
  eligible_count:=coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count:=coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok:=coalesce((base->>'physical_evidence_ok')::boolean,false);
  contamination:=coalesce((base->>'order_contamination_detected')::boolean,false);
  v14_exists:=to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text)') is not null;
  v13_disabled:=not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v13(uuid,text,text)','EXECUTE');
  safe_v14:=coalesce((base->>'visual_product_card_ready')::boolean,false)
    and coalesce((tax->>'ok')::boolean,false)
    and not evidence_ok and not contamination
    and eligible_count=1 and active_count=0
    and v14_exists and v13_disabled;

  if contamination then next_action:='investigate_physical_order_contamination';
  elsif evidence_ok then next_action:='physical_terminal_no_order_evidence_complete';
  elsif not coalesce((tax->>'ok')::boolean,false) then next_action:='fix_visible_taxonomy_readiness';
  elsif not v13_disabled then next_action:='disable_legacy_owner_launcher_v13';
  elsif active_count>0 then next_action:='continue_existing_owner_homologation_session';
  elsif eligible_count=0 then next_action:='wait_for_owner_service_window';
  elsif eligible_count=1 then next_action:='owner_conversation_ready_for_v14';
  else next_action:='select_one_owner_conversation_explicitly';
  end if;

  return base||jsonb_build_object(
    'visible_taxonomy_ready',coalesce((tax->>'ok')::boolean,false),
    'visible_taxonomy_version',tax->>'readiness_version',
    'visible_sections',tax->'visible_sections',
    'visible_terms',tax->'visible_terms',
    'hidden_zero_result_terms',tax->'hidden_zero_result_terms',
    'empty_visible_terms',tax->'empty_visible_terms',
    'safe_to_launch_owner_v13',false,
    'safe_to_launch_owner_v14',safe_v14,
    'direct_v13_service_role_disabled',v13_disabled,
    'launcher_preflight_version','v11-v70-visible-taxonomy-readiness',
    'dispatch_version','v14-v70-visible-taxonomy-runtime-v26-edge49',
    'next_action',next_action,
    'writes_performed',false,
    'control_plane_version','v70-visible-taxonomy-readiness'
  );
end;
$function$;
revoke all on function public.get_whatsapp_flow_v70_homologation_control_plane_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v70_homologation_control_plane_v1() to service_role;

commit;
