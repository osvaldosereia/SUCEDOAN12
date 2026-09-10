-- WhatsApp Flow V31: incorpora integridade de navegação/prévia ao gate completo.

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v5(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb:=public.get_whatsapp_flow_v31_full_release_readiness_v4(p_session_id);
  nav jsonb:=public.get_whatsapp_flow_v31_navigation_integrity_readiness_v1();
  checks jsonb:=coalesce(base->'checks','[]'::jsonb);
  nav_ok boolean:=coalesce((nav->>'healthy')::boolean,false);
  passed integer:=coalesce((base->>'passed')::integer,0)+(case when nav_ok then 1 else 0 end);
  total integer:=coalesce((base->>'total')::integer,0)+1;
  healthy boolean:=coalesce((base->>'healthy')::boolean,false) and nav_ok;
begin
  checks:=checks||jsonb_build_array(jsonb_build_object('name','navigation_preview_integrity','ok',nav_ok));
  return base || jsonb_build_object(
    'version','v5-with-navigation-preview-integrity',
    'checks',checks,
    'passed',passed,
    'total',total,
    'healthy',healthy,
    'ok',healthy and coalesce((base->>'homologation_ready')::boolean,false),
    'navigation_integrity',nav,
    'writes_executed',false,
    'orders_created',false
  );
end
$function$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v5(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v5(uuid) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'commercial_handler','handle_whatsapp_flow_commercial_exchange_v24',
  'handler_version','v24',
  'preview_version','v2',
  'pending_addon_dedupe',true,
  'component_price_visibility','hidden',
  'updated_by_checkpoint','run10'
), updated_at=now()
where slug='flow-cestas-comercial-v8-stable';
