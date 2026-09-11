create or replace function public.get_whatsapp_flow_v48_physical_homologation_preflight_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  v47 jsonb;
  transport public.whatsapp_flow_transport_config%rowtype;
  checks jsonb;
  v_last_event timestamptz;
  v_last_write timestamptz;
  v_recent_events bigint:=0;
  v_recent_errors bigint:=0;
begin
  select * into cfg from public.automation_config where id=1;
  v47:=public.get_whatsapp_flow_v47_terminal_contract_readiness_v1();
  select * into transport from public.whatsapp_flow_transport_config where id=1;

  select count(*),
         count(*) filter (where status <> 'accepted'),
         max(created_at)
    into v_recent_events,v_recent_errors,v_last_event
  from public.whatsapp_flow_exchange_events
  where created_at > now()-interval '24 hours';

  select max(created_at) into v_last_write
  from public.whatsapp_flow_write_operations;

  checks:=jsonb_build_array(
    jsonb_build_object('name','v47_terminal_contract_green','ok',coalesce((v47->>'ok')::boolean,false)),
    jsonb_build_object('name','transport_config_present','ok',transport.id=1),
    jsonb_build_object('name','transport_protocol_v3','ok',coalesce(transport.protocol_version,'')='3'),
    jsonb_build_object('name','transport_meta_signature_valid','ok',coalesce(transport.meta_signature_status,'')='valid'),
    jsonb_build_object('name','transport_public_key_present','ok',coalesce(length(transport.public_key_fingerprint),0)>=32),
    jsonb_build_object('name','exchange_path_observed_recently','ok',v_recent_events>0),
    jsonb_build_object('name','rollout_gates_locked','ok',
      coalesce(cfg.whatsapp_live_canary_percent,0)=1
      and not cfg.experience_orchestrator_enabled
      and not cfg.whatsapp_flow_data_exchange_enabled
      and not cfg.whatsapp_flow_send_enabled
      and not cfg.whatsapp_flow_commercial_write_enabled
      and not cfg.bling_order_sync_enabled)
  );

  return jsonb_build_object(
    'ok',not exists(select 1 from jsonb_array_elements(checks) x where coalesce((x->>'ok')::boolean,false)=false),
    'checks',checks,
    'runtime',v47->'runtime',
    'transport',jsonb_build_object(
      'key_version',transport.key_version,
      'protocol_version',transport.protocol_version,
      'meta_signature_status',transport.meta_signature_status,
      'meta_signature_checked_at',transport.meta_signature_checked_at,
      'public_key_fingerprint',transport.public_key_fingerprint
    ),
    'evidence',jsonb_build_object(
      'events_last_24h',v_recent_events,
      'nonaccepted_last_24h',v_recent_errors,
      'last_event_at',v_last_event,
      'last_write_operation_at',v_last_write,
      'physical_terminal_evidence_required',true,
      'required_sequence',jsonb_build_array('UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR','nfm_reply','localizacao')
    ),
    'gates',v47->'gates'
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_v48_physical_homologation_preflight_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v48_physical_homologation_preflight_v1() to service_role;
comment on function public.get_whatsapp_flow_v48_physical_homologation_preflight_v1() is 'V48 read-only physical homologation preflight: validates terminal commercial contract, encrypted Flow transport configuration, recent exchange path visibility and locked rollout gates before owner-only physical evidence.';
