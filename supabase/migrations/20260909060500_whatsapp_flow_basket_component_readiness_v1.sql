begin;

create or replace function public.get_whatsapp_basket_component_readiness_v1(p_basket_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_baskets jsonb;
  v_ready_count integer;
  v_total_count integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'basket_id',x.basket_id,
    'basket_name',x.basket_name,
    'total_items',x.total_items,
    'active_verified_items',x.active_verified_items,
    'strict_sellable_items',x.strict_sellable_items,
    'unavailable_items',x.total_items-x.active_verified_items,
    'ready_for_cart_write',x.total_items>0 and x.active_verified_items=x.total_items,
    'issues',x.issues
  ) order by x.basket_name),'[]'::jsonb),
  count(*) filter(where x.total_items>0 and x.active_verified_items=x.total_items),
  count(*)
  into v_baskets,v_ready_count,v_total_count
  from (
    select b.id basket_id,b.name basket_name,
      count(*)::integer total_items,
      count(*) filter(where p.is_active and p.physically_verified)::integer active_verified_items,
      count(*) filter(where p.is_active and p.physically_verified and p.is_whatsapp_active and coalesce(p.stock,0)>0)::integer strict_sellable_items,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id',p.id,
        'name',p.name,
        'is_active',p.is_active,
        'physically_verified',p.physically_verified,
        'is_whatsapp_active',p.is_whatsapp_active,
        'has_stock',coalesce(p.stock,0)>0
      ) order by bi.sort_order,p.name) filter(where not (p.is_active and p.physically_verified)),'[]'::jsonb) issues
    from public.basket_templates b
    join public.basket_template_items bi on bi.basket_id=b.id
    join public.products p on p.id=bi.product_id
    where b.is_active and b.is_whatsapp_active and (p_basket_id is null or b.id=p_basket_id)
    group by b.id,b.name
  ) x;

  return jsonb_build_object(
    'ready',v_total_count>0 and v_ready_count=v_total_count,
    'ready_baskets',v_ready_count,
    'total_baskets',v_total_count,
    'baskets',v_baskets,
    'policy',jsonb_build_object(
      'cart_write_requires_active_verified_components',true,
      'flow_preview_may_render_legacy_composition',true,
      'never_bypass_cart_write_validation',true
    )
  );
end;
$$;

create or replace function public.get_whatsapp_flow_commercial_readiness_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_transport jsonb:=public.get_whatsapp_flow_transport_readiness_v1();
  v_write jsonb:=public.get_whatsapp_flow_commercial_write_readiness_v1();
  v_baskets jsonb:=public.get_whatsapp_basket_component_readiness_v1(null);
  v_def jsonb;
begin
  select jsonb_build_object(
    'exists',true,
    'status',status,
    'provider_id_configured',coalesce(provider_id,'')<>'',
    'feature_key',feature_key
  ) into v_def
  from public.experience_definitions where slug='flow-cestas-comercial-v1' limit 1;
  if v_def is null then v_def:=jsonb_build_object('exists',false,'status','missing','provider_id_configured',false); end if;

  return jsonb_build_object(
    'ready_for_real_homologation',
      coalesce((v_transport->>'send_ready')::boolean,false)
      and coalesce((v_baskets->>'ready')::boolean,false)
      and coalesce((v_def->>'provider_id_configured')::boolean,false),
    'transport',v_transport,
    'commercial_write',v_write,
    'basket_components',v_baskets,
    'flow_definition',v_def,
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'basket_components',case when not coalesce((v_baskets->>'ready')::boolean,false) then 'basket_components_not_reconciled' end,
      'provider_id',case when not coalesce((v_def->>'provider_id_configured')::boolean,false) then 'flow_provider_id_missing' end,
      'transport',case when not coalesce((v_transport->>'send_ready')::boolean,false) then 'flow_transport_not_ready' end
    ))
  );
end;
$$;

revoke all on function public.get_whatsapp_basket_component_readiness_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_commercial_readiness_v2() from public,anon,authenticated;
grant execute on function public.get_whatsapp_basket_component_readiness_v1(uuid) to service_role;
grant execute on function public.get_whatsapp_flow_commercial_readiness_v2() to service_role;

commit;