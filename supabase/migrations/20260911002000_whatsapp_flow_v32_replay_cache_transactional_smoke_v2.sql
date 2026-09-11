create or replace function public.get_whatsapp_flow_v32_replay_cache_smoke_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_fp text := encode(extensions.digest(gen_random_uuid()::text || clock_timestamp()::text,'sha256'),'hex');
  v_first jsonb := jsonb_build_object('screen','TEST_SCREEN_A','data',jsonb_build_object('nonce','first'));
  v_second jsonb := jsonb_build_object('screen','TEST_SCREEN_B','data',jsonb_build_object('nonce','second'));
  v_cache1 jsonb;
  v_cache2 jsonb;
  v_replay jsonb;
  v_stored jsonb;
  v_cached_at timestamptz;
  v_rows int;
begin
  begin
    insert into public.whatsapp_flow_request_guard(
      request_fingerprint,request_id,session_id,action,screen,expires_at
    ) values (
      v_fp,'v32-smoke',null,'data_exchange','TEST_SCREEN',now()+interval '5 minutes'
    );

    v_cache1 := public.cache_whatsapp_flow_response_v1(v_fp,v_first);
    v_cache2 := public.cache_whatsapp_flow_response_v1(v_fp,v_second);
    v_replay := public.get_whatsapp_flow_replay_response_v1(v_fp);

    select response_payload,response_cached_at
      into v_stored,v_cached_at
      from public.whatsapp_flow_request_guard
     where request_fingerprint=v_fp;

    if not coalesce((v_cache1->>'ok')::boolean,false) then raise exception 'first_cache_failed'; end if;
    if not coalesce((v_cache2->>'ok')::boolean,false) then raise exception 'second_cache_failed'; end if;
    if not coalesce((v_replay->>'ok')::boolean,false)
       or not coalesce((v_replay->>'found')::boolean,false) then raise exception 'replay_reader_failed'; end if;
    if v_stored is distinct from v_first then raise exception 'first_response_not_immutable'; end if;
    if (v_replay->'response') is distinct from v_first then raise exception 'replay_response_mismatch'; end if;
    if v_cached_at is null then raise exception 'cached_at_missing'; end if;

    delete from public.whatsapp_flow_request_guard where request_fingerprint=v_fp;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'smoke_cleanup_failed'; end if;

    return jsonb_build_object(
      'ok',true,
      'version',2,
      'first_response_immutable',true,
      'replay_returns_first_response',true,
      'cached_at_present',true,
      'synthetic_guard_cleaned',true,
      'commercial_writes_executed',false,
      'pii_returned',false
    );
  exception when others then
    delete from public.whatsapp_flow_request_guard where request_fingerprint=v_fp;
    return jsonb_build_object(
      'ok',false,
      'version',2,
      'reason',left(sqlerrm,160),
      'synthetic_guard_cleaned',not exists(
        select 1 from public.whatsapp_flow_request_guard where request_fingerprint=v_fp
      ),
      'commercial_writes_executed',false,
      'pii_returned',false
    );
  end;
end;
$function$;

revoke all on function public.get_whatsapp_flow_v32_replay_cache_smoke_v2() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v32_replay_cache_smoke_v2() to service_role;

comment on function public.get_whatsapp_flow_v32_replay_cache_smoke_v2() is 'Flow V32: smoke transacional isolado do cache de replay; usa guard sintético, valida first-response-wins e remove o registro antes de retornar.';
