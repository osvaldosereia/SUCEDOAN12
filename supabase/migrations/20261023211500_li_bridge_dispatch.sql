-- Helper interno para consultas controladas ao gateway da Loja Integrada.
create or replace function private.li_bridge_dispatch(
  p_action text,
  p_args jsonb default '{}'::jsonb
)
returns table (job_id uuid, request_id bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_proof text;
  v_job uuid;
  v_request bigint;
begin
  if p_action not in ('status','products','categories') then
    raise exception 'unsupported_action' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_args,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_args' using errcode='22023';
  end if;
  v_proof := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.li_bridge_probe_jobs (proof_hash, action, args)
  values (encode(extensions.digest(v_proof,'sha256'),'hex'), p_action, p_args)
  returning id into v_job;
  v_request := net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/loja-integrada-probe-v1',
    body := jsonb_build_object('id', v_job::text, 'proof', v_proof),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  return query select v_job, v_request;
end;
$$;
revoke all on function private.li_bridge_dispatch(text,jsonb) from public, anon, authenticated;
grant execute on function private.li_bridge_dispatch(text,jsonb) to service_role;
comment on function private.li_bridge_dispatch(text,jsonb)
is 'Interno: despacha jobs de consulta LI usando prova descartável; nunca expõe o personal token';