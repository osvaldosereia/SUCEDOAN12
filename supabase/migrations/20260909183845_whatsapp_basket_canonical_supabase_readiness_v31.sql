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
  v_ready integer:=0;
  v_total integer:=0;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'basket_id',x.basket_id,
      'basket_sku',x.basket_sku,
      'basket_name',x.basket_name,
      'base_price',x.base_price,
      'total_items',x.total_items,
      'resolved_in_supabase',x.resolved_items,
      'legacy_active_verified_items',x.legacy_verified_items,
      'legacy_strict_sellable_items',x.legacy_sellable_items,
      'adjustable_priced_items',x.adjustable_priced_items,
      'fixed_quantity_unpriced_items',x.total_items-x.adjustable_priced_items,
      'basket_price_ready',x.base_price>0,
      'ready_for_cart_write',x.total_items>0 and x.resolved_items=x.total_items and x.base_price>0,
      'issues',case
        when x.total_items=0 then jsonb_build_array(jsonb_build_object('code','basket_composition_empty'))
        when x.resolved_items<>x.total_items then jsonb_build_array(jsonb_build_object('code','basket_component_missing','missing_count',x.total_items-x.resolved_items))
        when coalesce(x.base_price,0)<=0 then jsonb_build_array(jsonb_build_object('code','basket_price_not_configured'))
        else '[]'::jsonb
      end,
      'advisories',jsonb_build_object(
        'legacy_unverified_components',x.total_items-x.legacy_verified_items,
        'unpriced_components_fixed_quantity',x.total_items-x.adjustable_priced_items
      )
    ) order by x.sort_order,x.basket_name),'[]'::jsonb),
    count(*) filter(where x.total_items>0 and x.resolved_items=x.total_items and x.base_price>0),
    count(*)
  into v_baskets,v_ready,v_total
  from (
    select b.id basket_id,b.sku basket_sku,b.name basket_name,b.sort_order,b.base_price,
      count(bi.id)::integer total_items,
      count(p.id)::integer resolved_items,
      count(*) filter(where p.is_active and p.physically_verified)::integer legacy_verified_items,
      count(*) filter(where p.is_active and p.physically_verified and p.is_whatsapp_active and coalesce(p.stock,0)>0)::integer legacy_sellable_items,
      count(*) filter(where coalesce(p.price,0)>0 or bi.add_unit_delta is not null or bi.remove_unit_delta is not null)::integer adjustable_priced_items
    from public.basket_templates b
    left join public.basket_template_items bi on bi.basket_id=b.id
    left join public.products p on p.id=bi.product_id
    where b.is_active=true and b.is_whatsapp_active=true
      and (p_basket_id is null or b.id=p_basket_id)
    group by b.id,b.sku,b.name,b.sort_order,b.base_price
  ) x;

  return jsonb_build_object(
    'ready',v_total>0 and v_ready=v_total,
    'ready_baskets',v_ready,
    'total_baskets',v_total,
    'baskets',v_baskets,
    'source',jsonb_build_object(
      'basket_registry','supabase.basket_templates',
      'composition_registry','supabase.basket_template_items',
      'product_registry','supabase.products'
    ),
    'policy',jsonb_build_object(
      'supabase_is_official_product_registry',true,
      'active_basket_template_is_bundle_authority',true,
      'basket_components_require_product_row_resolution',true,
      'basket_components_do_not_require_standalone_sellable_flags',true,
      'standalone_addons_require_sellable_product',true,
      'unpriced_components_remain_fixed_quantity',true,
      'component_prices_visible',false,
      'never_fake_inventory_flags',true
    )
  );
end;
$$;

create or replace function public.get_whatsapp_basket_component_readiness_v2(p_basket_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb:=public.get_whatsapp_basket_component_readiness_v1(p_basket_id);
begin
  return jsonb_build_object(
    'preview_ready',coalesce((v->>'ready')::boolean,false),
    'preview_ready_baskets',coalesce((v->>'ready_baskets')::integer,0),
    'cart_write_ready',coalesce((v->>'ready')::boolean,false),
    'cart_write_ready_baskets',coalesce((v->>'ready_baskets')::integer,0),
    'total_baskets',coalesce((v->>'total_baskets')::integer,0),
    'baskets',coalesce(v->'baskets','[]'::jsonb),
    'source',v->'source',
    'policy',v->'policy'
  );
end;
$$;

create or replace function public.get_whatsapp_basket_component_readiness_v3(p_basket_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  return public.get_whatsapp_basket_component_readiness_v1(p_basket_id);
end;
$$;

revoke all on function public.get_whatsapp_basket_component_readiness_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_basket_component_readiness_v2(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_basket_component_readiness_v3(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_basket_component_readiness_v1(uuid) to service_role;
grant execute on function public.get_whatsapp_basket_component_readiness_v2(uuid) to service_role;
grant execute on function public.get_whatsapp_basket_component_readiness_v3(uuid) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'basket_readiness_policy','canonical_supabase_bundle_v31',
      'active_basket_template_is_bundle_authority',true,
      'standalone_addons_require_sellable_product',true,
      'legacy_product_flags_are_advisory_for_bundle_components',true,
      'implementation_stage','canonical_supabase_bundle_readiness_v31'
    ),
    updated_at=now()
where slug in ('flow-cestas-comercial-v1','flow-cestas-comercial-v2');

commit;
