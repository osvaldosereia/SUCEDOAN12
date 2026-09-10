begin;
create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_whatsapp_flow_v31_full_release_readiness_v1(p_session_id);
  tx jsonb:=public.get_whatsapp_flow_v31_transactional_readonly_readiness_v1();
  checks jsonb:=coalesce(base->'checks','[]'::jsonb);
  tx_ok boolean:=coalesce((tx->>'ok')::boolean,false);
  passed integer:=coalesce((base->>'passed')::integer,0)+(case when tx_ok then 1 else 0 end);
  total integer:=coalesce((base->>'total')::integer,0)+1;
  healthy boolean:=coalesce((base->>'healthy')::boolean,false) and tx_ok;
begin
  checks:=checks||jsonb_build_array(jsonb_build_object('name','transactional_readonly_regression','ok',tx_ok));
  return base || jsonb_build_object(
    'version','v2-with-transactional-readonly-regression',
    'checks',checks,
    'passed',passed,
    'total',total,
    'healthy',healthy,
    'ok',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'transactional_readonly',tx,
    'writes_executed',false,
    'orders_created',false
  );
end
$$;
revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v2(uuid) to service_role;
commit;
