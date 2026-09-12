begin;

create or replace function public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  preflight jsonb;
  checks jsonb;
  screens jsonb := '[]'::jsonb;
  v_upsell_at timestamptz;
  v_review_at timestamptz;
  v_customer_at timestamptz;
  v_finalize_at timestamptz;
  v_nfm_at timestamptz;
  v_location_at timestamptz;
  v_ordered boolean := false;
  v_ok boolean := false;
begin
  preflight := public.get_whatsapp_flow_v48_physical_homologation_preflight_v1();

  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;

  if d.id is not null then
    select * into s
    from public.experience_sessions es
    where es.definition_id=d.id
      and coalesce((es.context->>'requested_by_owner')::boolean,false)
      and coalesce((es.context->>'homologation_test')::boolean,false)
    order by coalesce(es.flow_exchange_count,0) desc, es.flow_state_version desc, es.updated_at desc
    limit 1;
  end if;

  if s.id is not null then
    select coalesce(jsonb_agg(x.screen order by x.first_seen),'[]'::jsonb)
      into screens
    from (
      select upper(e.screen) screen,min(e.created_at) first_seen
      from public.whatsapp_flow_exchange_events e
      where e.session_id=s.id and e.status='accepted' and nullif(e.screen,'') is not null
      group by upper(e.screen)
    ) x;

    select min(e.created_at) filter (where upper(coalesce(e.screen,''))='UPSELL'),
           min(e.created_at) filter (where upper(coalesce(e.screen,''))='REVISAO'),
           min(e.created_at) filter (where upper(coalesce(e.screen,'')) in ('CLIENTE_EXISTENTE','CLIENTE_NOVO','CLIENTE')),
           min(e.created_at) filter (where upper(coalesce(e.screen,'')) in ('FINALIZAR','SUCCESS','COMPLETE'))
      into v_upsell_at,v_review_at,v_customer_at,v_finalize_at
    from public.whatsapp_flow_exchange_events e
    where e.session_id=s.id and e.status='accepted';

    if v_finalize_at is null and s.completed_at is not null then v_finalize_at:=s.completed_at; end if;

    select min(ev.created_at) into v_nfm_at
    from public.experience_events ev
    where ev.session_id=s.id and ev.event_type='flow_nfm_reply' and ev.interface_type='whatsapp_flow'
      and (v_finalize_at is null or ev.created_at>=v_finalize_at);

    if v_nfm_at is not null then
      select min(m.created_at) into v_location_at
      from public.messages m
      where m.conversation_id=s.conversation_id and m.direction='inbound'
        and lower(coalesce(m.message_type,''))='location' and m.created_at>v_nfm_at;
    end if;
  end if;

  v_ordered := v_upsell_at is not null
    and v_review_at is not null and v_review_at>=v_upsell_at
    and v_customer_at is not null and v_customer_at>=v_review_at
    and v_finalize_at is not null and v_finalize_at>=v_customer_at
    and v_nfm_at is not null and v_nfm_at>=v_finalize_at
    and v_location_at is not null and v_location_at>v_nfm_at;

  checks:=jsonb_build_array(
    jsonb_build_object('name','v48_preflight_green','ok',coalesce((preflight->>'ok')::boolean,false)),
    jsonb_build_object('name','owner_homologation_session_present','ok',s.id is not null),
    jsonb_build_object('name','upsell_physically_observed','ok',v_upsell_at is not null),
    jsonb_build_object('name','review_after_upsell','ok',v_review_at is not null and v_upsell_at is not null and v_review_at>=v_upsell_at),
    jsonb_build_object('name','customer_after_review','ok',v_customer_at is not null and v_review_at is not null and v_customer_at>=v_review_at),
    jsonb_build_object('name','finalize_after_customer','ok',v_finalize_at is not null and v_customer_at is not null and v_finalize_at>=v_customer_at),
    jsonb_build_object('name','nfm_reply_after_finalize','ok',v_nfm_at is not null and v_finalize_at is not null and v_nfm_at>=v_finalize_at),
    jsonb_build_object('name','location_strictly_after_nfm','ok',v_location_at is not null and v_nfm_at is not null and v_location_at>v_nfm_at),
    jsonb_build_object('name','terminal_sequence_ordered','ok',v_ordered)
  );

  v_ok:=not exists(select 1 from jsonb_array_elements(checks) x where not coalesce((x->>'ok')::boolean,false));

  return jsonb_build_object(
    'ok',v_ok,'preflight_ok',coalesce((preflight->>'ok')::boolean,false),'checks',checks,
    'session',jsonb_build_object('id',s.id,'status',s.status,'conversation_id',s.conversation_id,'current_screen',s.flow_current_screen,'exchange_count',s.flow_exchange_count,'state_version',s.flow_state_version,'completed_at',s.completed_at,'updated_at',s.updated_at),
    'observed_screens',screens,
    'ordered_timestamps',jsonb_build_object('upsell_at',v_upsell_at,'review_at',v_review_at,'customer_at',v_customer_at,'finalize_at',v_finalize_at,'nfm_reply_at',v_nfm_at,'location_at',v_location_at),
    'required_sequence',jsonb_build_array('UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR','nfm_reply','location'),
    'next_required',case when v_upsell_at is null then 'UPSELL' when v_review_at is null or v_review_at<v_upsell_at then 'REVISAO' when v_customer_at is null or v_customer_at<v_review_at then 'CLIENTE_EXISTENTE|CLIENTE_NOVO' when v_finalize_at is null or v_finalize_at<v_customer_at then 'FINALIZAR' when v_nfm_at is null or v_nfm_at<v_finalize_at then 'nfm_reply' when v_location_at is null or v_location_at<=v_nfm_at then 'location' else 'complete' end,
    'sequence_strict',true,'writes_performed',false,'gates',preflight->'gates','evidence_version','v54-ordered-terminal'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1() to service_role;

create or replace function public.get_whatsapp_flow_v54_homologation_control_plane_v1()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  v53 jsonb; evidence jsonb; evidence_ok boolean:=false; eligible_count integer:=0; active_count integer:=0; safe_v9 boolean:=false; next_action text;
begin
  v53:=public.get_whatsapp_flow_v53_homologation_control_plane_v1();
  evidence:=public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1();
  evidence_ok:=coalesce((evidence->>'ok')::boolean,false);
  eligible_count:=coalesce((v53->>'eligible_owner_conversations')::integer,0);
  active_count:=coalesce((v53->>'active_owner_homologation_sessions')::integer,0);
  safe_v9:=coalesce((v53->>'runtime_readiness_ok')::boolean,false) and not evidence_ok and eligible_count=1 and active_count=0 and to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text)') is not null;
  if evidence_ok then next_action:='physical_terminal_evidence_complete_ordered';
  elsif not coalesce((v53->>'runtime_readiness_ok')::boolean,false) then next_action:='fix_runtime_readiness';
  elsif active_count>0 then next_action:='continue_existing_owner_homologation_session';
  elsif eligible_count=0 then next_action:='wait_for_owner_service_window';
  elsif eligible_count=1 then next_action:='owner_conversation_ready_for_v9';
  else next_action:='select_one_owner_conversation_explicitly'; end if;
  return v53 || jsonb_build_object('physical_evidence_ok',evidence_ok,'physical_next_required',coalesce(evidence->>'next_required',''),'physical_sequence_strict',true,'safe_to_launch_owner_v8',false,'safe_to_launch_owner_v9',safe_v9,'next_action',next_action,'control_plane_version','v54-ordered-terminal-evidence');
end;
$function$;

revoke all on function public.get_whatsapp_flow_v54_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v54_homologation_control_plane_v1() to service_role;

commit;
