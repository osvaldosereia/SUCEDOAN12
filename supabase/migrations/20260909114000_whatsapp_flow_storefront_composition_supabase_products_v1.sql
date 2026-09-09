begin;

-- Dona Antônia — WhatsApp Flow: composição oficial da vitrine + produtos do Supabase.
-- Esta migration NÃO relaxa a validação de escrita do carrinho.
-- Preview/edição pode renderizar a composição oficial mesmo quando um componente ainda não foi fisicamente verificado como item avulso.

create or replace function public.get_whatsapp_flow_basket_editor_v2(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  v_items jsonb;
  v_selection jsonb;
  v_summary text;
  v_total integer;
  v_resolved integer;
  v_verified integer;
  v_write_readiness jsonb;
  v_write_ready boolean:=false;
begin
  select * into b
  from public.basket_templates
  where id=p_basket_id
    and is_active=true
    and is_whatsapp_active=true;

  if not found then
    raise exception 'basket_not_available';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id::text,
      'sku',p.sku,
      'title',left(p.name,72),
      'image_url',p.image_url,
      'description',case
        when not bi.quantity_editable then 'Qtd. fixa: '||trim(to_char(bi.quantity,'FM999990D##'))
        when bi.removable then 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))||' · pode retirar'
        else 'Atual: '||trim(to_char(bi.quantity,'FM999990D##'))
      end,
      'component_state',case
        when p.is_active and p.physically_verified then 'verified'
        else 'canonical_unverified'
      end
    ) order by bi.sort_order,p.name),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',p.id,
      'sku',p.sku,
      'quantity',bi.quantity
    ) order by bi.sort_order,p.name),'[]'::jsonb),
    coalesce(string_agg(trim(to_char(bi.quantity,'FM999990D##'))||' × '||p.name,E'\n' order by bi.sort_order,p.name),''),
    count(*)::integer,
    count(p.id)::integer,
    count(*) filter(where p.is_active and p.physically_verified)::integer
  into v_items,v_selection,v_summary,v_total,v_resolved,v_verified
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=b.id;

  v_write_readiness:=public.get_whatsapp_basket_component_readiness_v1(b.id);
  v_write_ready:=coalesce((v_write_readiness->>'ready')::boolean,false);

  return jsonb_build_object(
    'basket_id',b.id,
    'basket_sku',b.sku,
    'basket_name',b.name,
    'basket_price','R$ '||replace(to_char(b.base_price,'FM999999990.00'),'.',','),
    'basket_image_url',b.image_url,
    'items',v_items,
    'selection',v_selection,
    'summary',v_summary,
    'actions',jsonb_build_array(
      jsonb_build_object('id','edit','title','Alterar um item'),
      jsonb_build_object('id','continue','title','Concluir personalização')
    ),
    'quantities',(select jsonb_agg(jsonb_build_object('id',g::text,'title',g::text) order by g) from generate_series(0,20) g),
    'readiness',jsonb_build_object(
      'preview_ready',v_total>0 and v_resolved=v_total,
      'total_components',v_total,
      'resolved_in_supabase',v_resolved,
      'physically_verified_components',v_verified,
      'cart_write_ready',v_write_ready
    ),
    'source',jsonb_build_object(
      'basket_composition','storefront_canonical_codes',
      'basket_registry','supabase.basket_templates + supabase.basket_template_items',
      'product_registry','supabase.products',
      'runtime_catalog_full_load',false
    ),
    'policy',jsonb_build_object(
      'component_prices_visible',false,
      'preview_allows_canonical_unverified_components',true,
      'cart_write_requires_strict_readiness',true,
      'backend_validation_required',true,
      'ai_may_invent_product_data',false
    )
  );
end;
$$;

create or replace function public.get_whatsapp_flow_basket_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  return public.get_whatsapp_flow_basket_editor_v2(p_basket_id);
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
  v_baskets jsonb;
  v_preview_ready integer;
  v_write_ready integer;
  v_total integer;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'basket_id',x.basket_id,
      'basket_sku',x.basket_sku,
      'basket_name',x.basket_name,
      'total_items',x.total_items,
      'resolved_in_supabase',x.resolved_items,
      'physically_verified_items',x.verified_items,
      'preview_ready',x.total_items>0 and x.resolved_items=x.total_items,
      'cart_write_ready',x.total_items>0 and x.verified_items=x.total_items
    ) order by x.sort_order,x.basket_name),'[]'::jsonb),
    count(*) filter(where x.total_items>0 and x.resolved_items=x.total_items),
    count(*) filter(where x.total_items>0 and x.verified_items=x.total_items),
    count(*)
  into v_baskets,v_preview_ready,v_write_ready,v_total
  from (
    select b.id basket_id,b.sku basket_sku,b.name basket_name,b.sort_order,
      count(*)::integer total_items,
      count(p.id)::integer resolved_items,
      count(*) filter(where p.is_active and p.physically_verified)::integer verified_items
    from public.basket_templates b
    join public.basket_template_items bi on bi.basket_id=b.id
    left join public.products p on p.id=bi.product_id
    where b.is_active and b.is_whatsapp_active
      and (p_basket_id is null or b.id=p_basket_id)
    group by b.id,b.sku,b.name,b.sort_order
  ) x;

  return jsonb_build_object(
    'preview_ready',v_total>0 and v_preview_ready=v_total,
    'preview_ready_baskets',v_preview_ready,
    'cart_write_ready',v_total>0 and v_write_ready=v_total,
    'cart_write_ready_baskets',v_write_ready,
    'total_baskets',v_total,
    'baskets',v_baskets,
    'source',jsonb_build_object(
      'composition','storefront_canonical_codes',
      'products','supabase.products'
    ),
    'policy',jsonb_build_object(
      'preview_and_write_readiness_are_separate',true,
      'never_enable_write_from_preview_readiness',true
    )
  );
end;
$$;

revoke all on function public.get_whatsapp_flow_basket_editor_v2(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_flow_basket_editor_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_whatsapp_basket_component_readiness_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_basket_editor_v2(uuid) to service_role;
grant execute on function public.get_whatsapp_flow_basket_editor_v1(uuid) to service_role;
grant execute on function public.get_whatsapp_basket_component_readiness_v2(uuid) to service_role;

update public.basket_templates
set rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object(
  'composition_source','site/produtos-cesta-basica.json',
  'runtime_product_source','supabase.products',
  'component_prices_visible',false
),
updated_at=now()
where is_active=true and is_whatsapp_active=true;

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
    'basket_composition_source','storefront_canonical_codes',
    'product_runtime_source','supabase.products',
    'full_catalog_load_forbidden',true,
    'basket_editor_version','v2'
  ),
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'implementation_stage','storefront_composition_supabase_products'
  ),
  updated_at=now()
where slug='flow-cestas-comercial-v1';

update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
