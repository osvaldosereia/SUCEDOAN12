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
      'title',left(p.name,30),
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
