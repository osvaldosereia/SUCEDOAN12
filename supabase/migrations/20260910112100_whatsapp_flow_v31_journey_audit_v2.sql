create or replace function public.get_whatsapp_flow_v31_journey_audit_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.experience_sessions%rowtype;
  d public.experience_definitions%rowtype;
  v_events jsonb := '[]'::jsonb;
  v_screens text[] := array[]::text[];
  v_event_count int := 0;
  v_error_count int := 0;
  v_replay_count int := 0;
  v_order jsonb := null;
  v_outbound jsonb := '[]'::jsonb;
  v_preflight jsonb;
  v_location_requested boolean := false;
  v_flow_return_seen boolean := false;
  v_basket_seen boolean := false;
  v_personalization_seen boolean := false;
  v_extras_seen boolean := false;
  v_upsell_seen boolean := false;
  v_review_seen boolean := false;
  v_customer_seen boolean := false;
  v_final_seen boolean := false;
  v_next_expected text := 'OPEN_FLOW';
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then return jsonb_build_object('ok',false,'reason','session_not_found'); end if;

  select * into d from public.experience_definitions where id=s.definition_id;
  if d.slug <> 'flow-cestas-comercial-v8-stable' then
    return jsonb_build_object('ok',false,'reason','not_v31_candidate','definition_slug',d.slug);
  end if;

  select count(*)::int,
         count(*) filter (where status='rejected' or error_code is not null)::int,
         count(*) filter (where is_replay)::int,
         coalesce(array_agg(distinct screen) filter (where screen is not null),array[]::text[]),
         coalesce(jsonb_agg(jsonb_build_object('at',created_at,'action',action,'screen',screen,'status',status,'error_code',error_code,'replay',is_replay) order by created_at),'[]'::jsonb)
    into v_event_count,v_error_count,v_replay_count,v_screens,v_events
    from public.whatsapp_flow_exchange_events where session_id=p_session_id;

  v_basket_seen := coalesce('CESTAS'=any(v_screens),false) or coalesce(s.flow_current_screen='CESTAS',false);
  v_personalization_seen := exists(select 1 from unnest(v_screens) z where z like 'PERSONALIZAR_%' or z like 'AJUSTAR_ITEM_%') or coalesce(s.flow_current_screen like 'PERSONALIZAR%',false) or coalesce(s.flow_current_screen like 'AJUSTAR_ITEM%',false);
  v_extras_seen := exists(select 1 from unnest(v_screens) z where z like 'SECOES_%' or z like 'TERMOS_%' or z like 'PRODUTOS_%' or z like 'PRODUTO_%');
  v_upsell_seen := coalesce('UPSELL'=any(v_screens),false) or coalesce(s.flow_current_screen='UPSELL',false);
  v_review_seen := coalesce('REVISAO'=any(v_screens),false) or coalesce(s.flow_current_screen='REVISAO',false);
  v_customer_seen := exists(select 1 from unnest(v_screens) z where z in ('CLIENTE_EXISTENTE','CLIENTE_NOVO')) or coalesce(s.flow_current_screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO'),false);
  v_final_seen := coalesce('FINALIZAR'=any(v_screens),false) or coalesce(s.flow_current_screen='FINALIZAR',false) or s.completed_at is not null;

  select to_jsonb(x) into v_order from (
    select o.id,o.status,o.total,o.currency,o.confirmed_at,o.created_at,o.cart_id,o.basket_id,o.bling_order_id,o.bling_synced_at,o.sync_status,o.other_expenses
      from public.orders o
     where (s.cart_id is not null and o.cart_id=s.cart_id)
        or (s.cart_id is null and o.conversation_id=s.conversation_id and o.created_at>=s.offered_at)
     order by o.created_at desc limit 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('job_type',job_type,'status',status,'http_status',dispatch_response_status,'sent_at',sent_at,'attempts',attempts,'last_error',left(coalesce(last_error,''),160)) order by created_at),'[]'::jsonb)
    into v_outbound from public.outbound_jobs where conversation_id=s.conversation_id and created_at>=s.offered_at;

  select exists(select 1 from public.messages m where m.conversation_id=s.conversation_id and m.created_at>=s.offered_at and m.direction='inbound' and coalesce(m.raw_event::text,'') ilike '%nfm_reply%') into v_flow_return_seen;
  select exists(select 1 from public.outbound_jobs j where j.conversation_id=s.conversation_id and j.created_at>=s.offered_at and (coalesce(j.payload::text,'') ilike '%localiza%' or coalesce(j.payload::text,'') ilike '%location%')) into v_location_requested;

  if v_event_count=0 then v_next_expected:='OPEN_FLOW';
  elsif not v_basket_seen then v_next_expected:='CESTAS';
  elsif not v_personalization_seen then v_next_expected:='PERSONALIZACAO';
  elsif not v_extras_seen then v_next_expected:='EXTRAS_SECOES_TERMOS';
  elsif not v_upsell_seen then v_next_expected:='UPSELL';
  elsif not v_review_seen then v_next_expected:='REVISAO';
  elsif not v_customer_seen then v_next_expected:='CLIENTE_ENDERECO';
  elsif not v_final_seen then v_next_expected:='FINALIZAR';
  elsif not v_flow_return_seen then v_next_expected:='NFM_REPLY';
  elsif not v_location_requested then v_next_expected:='PEDIR_LOCALIZACAO';
  else v_next_expected:='JORNADA_COMPLETA'; end if;

  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v1(p_session_id);

  return jsonb_build_object(
    'ok',true,
    'session',jsonb_build_object('id',s.id,'status',s.status,'current_screen',s.flow_current_screen,'offered_at',s.offered_at,'opened_at',s.opened_at,'completed_at',s.completed_at,'expires_at',s.expires_at,'exchange_count',s.flow_exchange_count,'last_exchange_at',s.flow_last_exchange_at,'state_version',s.flow_state_version),
    'definition',jsonb_build_object('slug',d.slug,'provider_id',d.provider_id,'status',d.status,'handler_version',d.config->>'handler_version','flow_json_version',d.config->>'flow_json_version'),
    'preflight',v_preflight,
    'exchange',jsonb_build_object('count',v_event_count,'errors',v_error_count,'replays',v_replay_count,'screens',to_jsonb(v_screens),'timeline',v_events),
    'milestones',jsonb_build_object('init_seen',v_event_count>0,'basket_seen',v_basket_seen,'personalization_seen',v_personalization_seen,'extras_seen',v_extras_seen,'upsell_seen',v_upsell_seen,'review_seen',v_review_seen,'customer_seen',v_customer_seen,'final_seen',v_final_seen,'order_created',v_order is not null,'flow_return_seen',v_flow_return_seen,'location_requested',v_location_requested),
    'next_expected',v_next_expected,
    'order',v_order,
    'outbound',v_outbound,
    'healthy',coalesce((v_preflight->>'ok')::boolean,false) and v_error_count=0,
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_journey_audit_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v31_journey_audit_v1(uuid) to service_role;
