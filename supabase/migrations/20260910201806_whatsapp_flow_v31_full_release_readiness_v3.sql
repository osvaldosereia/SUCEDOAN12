begin;

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v3(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_whatsapp_flow_v31_full_release_readiness_v2(p_session_id);
  deep jsonb:=public.get_whatsapp_flow_v31_deep_readonly_readiness_v2();
  checks jsonb:=coalesce(base->'checks','[]'::jsonb);
  deep_ok boolean:=coalesce((deep->>'ok')::boolean,false);
  passed integer:=coalesce((base->>'passed')::integer,0)+(case when deep_ok then 1 else 0 end);
  total integer:=coalesce((base->>'total')::integer,0)+1;
  healthy boolean:=coalesce((base->>'healthy')::boolean,false) and deep_ok;
begin
  checks:=checks||jsonb_build_array(jsonb_build_object('name','deep_readonly_regression','ok',deep_ok));
  return base || jsonb_build_object(
    'version','v3-with-deep-readonly-regression',
    'checks',checks,
    'passed',passed,
    'total',total,
    'healthy',healthy,
    'ok',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'deep_readonly',deep,
    'writes_executed',false,
    'orders_created',false
  );
end
$$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v3(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v3(uuid) to service_role;

commit;
