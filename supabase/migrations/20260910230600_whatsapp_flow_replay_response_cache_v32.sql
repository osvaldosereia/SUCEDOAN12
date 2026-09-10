begin;

alter table public.whatsapp_flow_request_guard
  add column if not exists response_payload jsonb,
  add column if not exists response_cached_at timestamptz;

create or replace function public.cache_whatsapp_flow_response_v1(
  p_request_fingerprint text,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fingerprint text:=lower(trim(coalesce(p_request_fingerprint,'')));
  v_response jsonb:=coalesce(p_response,'null'::jsonb);
  v_stored jsonb;
  v_cached_at timestamptz;
begin
  if v_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid_request_fingerprint');
  end if;
  if jsonb_typeof(v_response)<>'object' then
    return jsonb_build_object('ok',false,'reason','invalid_response_payload');
  end if;

  update public.whatsapp_flow_request_guard
     set response_payload=coalesce(response_payload,v_response),
         response_cached_at=coalesce(response_cached_at,now())
   where request_fingerprint=v_fingerprint
   returning response_payload,response_cached_at into v_stored,v_cached_at;

  if not found then
    return jsonb_build_object('ok',false,'reason','request_guard_not_found');
  end if;

  return jsonb_build_object('ok',true,'cached',true,'response',v_stored,'cached_at',v_cached_at);
end;
$$;

revoke all on function public.cache_whatsapp_flow_response_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.cache_whatsapp_flow_response_v1(text,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_replay_response_v1(
  p_request_fingerprint text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_fingerprint text:=lower(trim(coalesce(p_request_fingerprint,'')));
  r public.whatsapp_flow_request_guard%rowtype;
begin
  if v_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'found',false,'reason','invalid_request_fingerprint');
  end if;

  select * into r
    from public.whatsapp_flow_request_guard
   where request_fingerprint=v_fingerprint
     and expires_at>now();

  if not found then
    return jsonb_build_object('ok',true,'found',false,'reason','request_guard_not_found');
  end if;

  return jsonb_build_object(
    'ok',true,
    'found',r.response_payload is not null,
    'response',r.response_payload,
    'session_id',r.session_id,
    'action',r.action,
    'screen',r.screen,
    'cached_at',r.response_cached_at
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_replay_response_v1(text) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_replay_response_v1(text) to service_role;

create or replace function public.get_whatsapp_flow_replay_cache_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  has_payload boolean;
  has_cached_at boolean;
begin
  select * into cfg from public.automation_config where id=1;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='whatsapp_flow_request_guard' and column_name='response_payload') into has_payload;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='whatsapp_flow_request_guard' and column_name='response_cached_at') into has_cached_at;
  return jsonb_build_object(
    'version',1,
    'ready',has_payload and has_cached_at
      and to_regprocedure('public.cache_whatsapp_flow_response_v1(text,jsonb)') is not null
      and to_regprocedure('public.get_whatsapp_flow_replay_response_v1(text)') is not null,
    'response_payload_column',has_payload,
    'response_cached_at_column',has_cached_at,
    'cache_function',to_regprocedure('public.cache_whatsapp_flow_response_v1(text,jsonb)') is not null,
    'replay_reader',to_regprocedure('public.get_whatsapp_flow_replay_response_v1(text)') is not null,
    'canary_percent',cfg.whatsapp_live_canary_percent,
    'flow_send_enabled',cfg.whatsapp_flow_send_enabled,
    'data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
    'commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
    'bling_sync_enabled',cfg.bling_order_sync_enabled,
    'commercial_writes_permitted',false
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_replay_cache_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_replay_cache_readiness_v1() to service_role;

comment on function public.cache_whatsapp_flow_response_v1(text,jsonb) is 'Flow V32: cache imutável da primeira resposta por fingerprint para retries idempotentes.';
comment on function public.get_whatsapp_flow_replay_response_v1(text) is 'Flow V32: recupera a resposta já calculada sem repetir transições de estado.';

commit;
