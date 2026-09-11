create or replace function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  preflight jsonb;
  checks jsonb;
  screens jsonb := '[]'::jsonb;
  v_has_upsell boolean := false;
  v_has_review boolean := false;
  v_has_customer boolean := false;
  v_has_finalize boolean := false;
  v_has_nfm boolean := false;
  v_has_location boolean := false;
  v_nfm_at timestamptz;
  v_location_at timestamptz;
begin
  preflight:=public.get_whatsapp_flow_v48_physical_homologation_preflight_v1();

  select * into d
  from public.experience_definitions
  where slug='flow-cestas-comercial-v8-stable'
  limit 1;

  select * into s
  from public.experience_sessions es
  where es.definition_id=d.id
    and coalesce((es.context->>'requested_by_owner')::boolean,false)=true
    and coalesce((es.context->>'homologation_test')::boolean,false)=true
  order by coalesce(es.flow_exchange_count,0) desc,
           es.flow_state_version desc,
           es.updated_at desc
  limit 1;

  if s.id is not null then
    select coalesce(jsonb_agg(x.screen order by x.first_seen),'[]'::jsonb)
      into screens
    from (
      select e.screen,min(e.created_at) first_seen
      from public.whatsapp_flow_exchange_events e
      where e.session_id=s.id
        and e.status='accepted'
        and e.screen is not null
      group by e.screen
    ) x;

    select
      bool_or(upper(coalesce(e.screen,''))='UPSELL'),
      bool_or(upper(coalesce(e.screen,''))='REVISAO'),
      bool_or(upper(coalesce(e.screen,'')) in ('CLIENTE_EXISTENTE','CLIENTE_NOVO','CLIENTE')),
      bool_or(upper(coalesce(e.screen,'')) in ('FINALIZAR','SUCCESS','COMPLETE'))
    into v_has_upsell,v_has_review,v_has_customer,v_has_finalize
    from public.whatsapp_flow_exchange_events e
    where e.session_id=s.id and e.status='accepted';

    select min(ev.created_at)
      into v_nfm_at
    from public.experience_events ev
    where ev.session_id=s.id
      and ev.event_type='flow_nfm_reply'
      and ev.interface_type='whatsapp_flow';
    v_has_nfm:=v_nfm_at is not null;

    if v_has_nfm then
      select min(m.created_at)
        into v_location_at
      from public.messages m
      where m.conversation_id=s.conversation_id
        and m.direction='inbound'
        and lower(coalesce(m.message_type,''))='location'
        and m.created_at>=v_nfm_at;
      v_has_location:=v_location_at is not null;
    end if;
  end if;

  checks:=jsonb_build_array(
    jsonb_build_object('name','v48_preflight_green','ok',coalesce((preflight->>'ok')::boolean,false)),
    jsonb_build_object('name','owner_homologation_session_present','ok',s.id is not null),
    jsonb_build_object('name','upsell_physically_observed','ok',coalesce(v_has_upsell,false)),
    jsonb_build_object('name','review_physically_observed','ok',coalesce(v_has_review,false)),
    jsonb_build_object('name','customer_checkout_physically_observed','ok',coalesce(v_has_customer,false)),
    jsonb_build_object('name','finalize_physically_observed','ok',coalesce(v_has_finalize,false) or s.completed_at is not null),
    jsonb_build_object('name','nfm_reply_physically_observed','ok',coalesce(v_has_nfm,false)),
    jsonb_build_object('name','location_physically_observed_after_nfm','ok',coalesce(v_has_location,false))
  );

  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'preflight_ok',coalesce((preflight->>'ok')::boolean,false),
    'checks',checks,
    'session',jsonb_build_object(
      'id',s.id,
      'status',s.status,
      'conversation_id',s.conversation_id,
      'current_screen',s.flow_current_screen,
      'exchange_count',s.flow_exchange_count,
      'state_version',s.flow_state_version,
      'completed_at',s.completed_at,
      'updated_at',s.updated_at
    ),
    'observed_screens',screens,
    'nfm_reply_at',v_nfm_at,
    'location_at',v_location_at,
    'required_sequence',jsonb_build_array('UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR','nfm_reply','location'),
    'next_required',case
      when not coalesce(v_has_upsell,false) then 'UPSELL'
      when not coalesce(v_has_review,false) then 'REVISAO'
      when not coalesce(v_has_customer,false) then 'CLIENTE_EXISTENTE|CLIENTE_NOVO'
      when not (coalesce(v_has_finalize,false) or s.completed_at is not null) then 'FINALIZAR'
      when not coalesce(v_has_nfm,false) then 'nfm_reply'
      when not coalesce(v_has_location,false) then 'location'
      else 'complete'
    end,
    'gates',preflight->'gates'
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1() to service_role;
comment on function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1() is 'V49 read-only owner homologation evidence monitor. Requires physical accepted terminal screens, flow_nfm_reply event and a subsequent inbound WhatsApp location message; never changes rollout gates or commercial state.';
