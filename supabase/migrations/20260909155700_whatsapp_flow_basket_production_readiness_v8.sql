begin;

-- Dona Antônia — produção do WhatsApp Flow.
-- Supabase/Admin v3 são a fonte oficial de cestas, composição e produtos.
-- Componentes de uma cesta oficial não dependem dos flags de venda avulsa.
-- Produtos adicionais continuam usando as regras estritas de produto vendável.

create or replace function public.get_whatsapp_basket_component_readiness_v3(p_basket_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_baskets jsonb;
  v_ready integer;
  v_total integer;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'basket_id',x.basket_id,
      'basket_sku',x.basket_sku,
      'basket_name',x.basket_name,
      'total_items',x.total_items,
      'resolved_items',x.resolved_items,
      'priced_for_adjustment_items',x.priced_items,
      'basket_price_ready',x.base_price>0,
      'cart_write_ready',x.total_items>0 and x.resolved_items=x.total_items and x.base_price>0
    ) order by x.sort_order,x.basket_name),'[]'::jsonb),
    count(*) filter(where x.total_items>0 and x.resolved_items=x.total_items and x.base_price>0),
    count(*)
  into v_baskets,v_ready,v_total
  from (
    select b.id basket_id,b.sku basket_sku,b.name basket_name,b.sort_order,b.base_price,
      count(bi.id)::integer total_items,
      count(p.id)::integer resolved_items,
      count(*) filter(where coalesce(p.price,0)>0 or bi.add_unit_delta is not null or bi.remove_unit_delta is not null)::integer priced_items
    from public.basket_templates b
    join public.basket_template_items bi on bi.basket_id=b.id
    left join public.products p on p.id=bi.product_id
    where b.is_active and b.is_whatsapp_active
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
      'basket_components_follow_template_availability',true,
      'addon_products_require_sellable_flags',true,
      'unpriced_components_remain_fixed_quantity',true,
      'component_prices_visible',false
    )
  );
end;
$$;

create or replace function public.start_basket_cart(p_conversation_id uuid,p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer_id uuid;
  v_price numeric;
  v_cart_id uuid;
  v_result jsonb;
begin
  select customer_id into v_customer_id
  from public.conversations
  where id=p_conversation_id and status<>'closed';
  if not found then raise exception 'conversation_not_found'; end if;

  select base_price into v_price
  from public.basket_templates
  where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;
  if coalesce(v_price,0)<=0 then raise exception 'basket_price_not_configured'; end if;
  if not exists(select 1 from public.basket_template_items where basket_id=p_basket_id) then
    raise exception 'basket_composition_empty';
  end if;
  if exists(
    select 1
    from public.basket_template_items bi
    left join public.products p on p.id=bi.product_id
    where bi.basket_id=p_basket_id and p.id is null
  ) then raise exception 'basket_component_missing'; end if;

  update public.carts
     set status='cancelled',updated_at=now()
   where conversation_id=p_conversation_id and status='draft';

  insert into public.carts(conversation_id,customer_id,basket_id,status,base_commercial_price,total,expires_at)
  values(p_conversation_id,v_customer_id,p_basket_id,'draft',v_price,v_price,now()+interval '24 hours')
  returning id into v_cart_id;

  insert into public.cart_items(
    cart_id,product_id,source,quantity,base_quantity,unit_price,line_total,commercial_delta,metadata
  )
  select v_cart_id,bi.product_id,'basket',bi.quantity,bi.quantity,coalesce(p.price,0),bi.quantity*coalesce(p.price,0),0,
    jsonb_build_object(
      'basket_template_item_id',bi.id,
      'remove_unit_delta',bi.remove_unit_delta,
      'add_unit_delta',bi.add_unit_delta,
      'removable',bi.removable,
      'quantity_editable',bi.quantity_editable,
      'min_quantity',bi.min_quantity,
      'max_quantity',bi.max_quantity,
      'substitution_group',bi.substitution_group,
      'basket_component_official',true
    )
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=p_basket_id
  order by bi.sort_order,bi.created_at;

  v_result:=public.recalculate_cart(v_cart_id);
  update public.conversations set stage='customizing',updated_at=now() where id=p_conversation_id;
  return v_result || jsonb_build_object('basket_id',p_basket_id,'composition_source','supabase');
end;
$$;

create or replace function public.get_whatsapp_flow_basket_adjustment_options_v1(p_basket_id uuid,p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  bi public.basket_template_items%rowtype;
  p public.products%rowtype;
  v_min numeric;
  v_max numeric;
  v_options jsonb;
  v_remove_priced boolean;
  v_add_priced boolean;
  v_can_remove boolean;
  v_can_decrease boolean;
  v_can_increase boolean;
begin
  select * into b from public.basket_templates
   where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  select * into bi from public.basket_template_items
   where basket_id=b.id and product_id=p_product_id;
  if not found then raise exception 'basket_component_not_found'; end if;

  select * into p from public.products where id=p_product_id;
  if not found then raise exception 'product_missing'; end if;

  v_remove_priced:=bi.remove_unit_delta is not null or coalesce(p.price,0)>0;
  v_add_priced:=bi.add_unit_delta is not null or coalesce(p.price,0)>0;
  v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
  v_max:=coalesce(bi.max_quantity,greatest(bi.quantity,20));

  if not v_remove_priced then v_min:=bi.quantity; end if;
  if not v_add_priced then v_max:=bi.quantity; end if;

  v_can_remove:=coalesce(bi.removable,false) and v_remove_priced and v_min=0;
  v_can_decrease:=coalesce(bi.quantity_editable,false) and v_remove_priced and v_min<bi.quantity;
  v_can_increase:=coalesce(bi.quantity_editable,false) and v_add_priced and v_max>bi.quantity;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g::text,
    'title',case
      when g=0 then 'Retirar da cesta'
      when g=bi.quantity then trim(to_char(g,'FM999990D##'))||' · quantidade atual'
      else trim(to_char(g,'FM999990D##'))
    end
  ) order by g),'[]'::jsonb)
  into v_options
  from generate_series(ceil(v_min)::integer,floor(v_max)::integer) g
  where (g<>0 or v_can_remove)
    and (g=bi.quantity or bi.quantity_editable);

  return jsonb_build_object(
    'basket_id',b.id,
    'product_id',p.id,
    'product_name',p.name,
    'current_quantity',bi.quantity,
    'allowed_quantities',v_options,
    'policy',jsonb_build_object(
      'component_prices_visible',false,
      'removal_allowed',v_can_remove,
      'decrease_allowed',v_can_decrease,
      'increase_allowed',v_can_increase,
      'min_quantity',v_min,
      'max_quantity',v_max,
      'adjustment_pricing_ready',v_remove_priced or v_add_priced,
      'unpriced_component_fixed',not (v_remove_priced or v_add_priced),
      'backend_validation_required',true
    )
  );
end;
$$;

create or replace function public.validate_basket_flow_selection_v1(p_basket_id uuid,p_selection jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  x jsonb;
  bi public.basket_template_items%rowtype;
  p public.products%rowtype;
  v_id_text text;
  v_product_id uuid;
  v_qty numeric;
  v_min numeric;
  v_max numeric;
  v_seen uuid[]:='{}'::uuid[];
  v_normalized jsonb:='[]'::jsonb;
  v_issues jsonb:='[]'::jsonb;
  v_expected integer:=0;
  v_remove_priced boolean;
  v_add_priced boolean;
begin
  select * into b from public.basket_templates
  where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;

  if jsonb_typeof(coalesce(p_selection,'null'::jsonb))<>'array' then
    return jsonb_build_object('valid',false,'contract','basket_personalization_v2','normalized','[]'::jsonb,'issues',jsonb_build_array(jsonb_build_object('code','selection_must_be_array')));
  end if;

  select count(*) into v_expected from public.basket_template_items where basket_id=b.id;

  for x in select value from jsonb_array_elements(p_selection)
  loop
    if jsonb_typeof(x)<>'object' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','item_must_be_object'));
      continue;
    end if;
    v_id_text:=trim(coalesce(x->>'product_id',''));
    if v_id_text!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_product_id'));
      continue;
    end if;
    v_product_id:=v_id_text::uuid;
    if v_product_id=any(v_seen) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','duplicate_product','product_id',v_product_id));
      continue;
    end if;
    v_seen:=array_append(v_seen,v_product_id);

    select * into bi from public.basket_template_items where basket_id=b.id and product_id=v_product_id;
    if not found then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_not_in_basket','product_id',v_product_id));
      continue;
    end if;
    select * into p from public.products where id=v_product_id;
    if not found then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_missing','product_id',v_product_id));
      continue;
    end if;
    if coalesce(x->>'quantity','')!~'^[0-9]+$' then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_quantity','product_id',v_product_id));
      continue;
    end if;

    v_qty:=(x->>'quantity')::numeric;
    v_remove_priced:=bi.remove_unit_delta is not null or coalesce(p.price,0)>0;
    v_add_priced:=bi.add_unit_delta is not null or coalesce(p.price,0)>0;
    v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
    v_max:=coalesce(bi.max_quantity,greatest(bi.quantity,20));
    if not v_remove_priced then v_min:=bi.quantity; end if;
    if not v_add_priced then v_max:=bi.quantity; end if;

    if v_qty<v_min or v_qty>v_max then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','quantity_out_of_range','product_id',v_product_id,'min',v_min,'max',v_max));
      continue;
    end if;
    if not bi.quantity_editable and v_qty<>bi.quantity then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','quantity_not_editable','product_id',v_product_id));
      continue;
    end if;
    if not bi.removable and v_qty=0 then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','product_not_removable','product_id',v_product_id));
      continue;
    end if;
    if v_qty<bi.quantity and not v_remove_priced then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','remove_pricing_not_configured','product_id',v_product_id));
      continue;
    end if;
    if v_qty>bi.quantity and not v_add_priced then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','add_pricing_not_configured','product_id',v_product_id));
      continue;
    end if;

    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object(
      'product_id',v_product_id,
      'name',p.name,
      'base_quantity',bi.quantity,
      'quantity',v_qty,
      'changed',v_qty<>bi.quantity,
      'removable',bi.removable,
      'quantity_editable',bi.quantity_editable
    ));
  end loop;

  for bi in select * from public.basket_template_items where basket_id=b.id
  loop
    if not (bi.product_id=any(v_seen)) then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','missing_component','product_id',bi.product_id));
    end if;
  end loop;

  return jsonb_build_object(
    'valid',jsonb_array_length(v_issues)=0 and jsonb_array_length(v_normalized)=v_expected,
    'contract','basket_personalization_v2',
    'basket_id',b.id,
    'normalized',v_normalized,
    'issues',v_issues,
    'policy',jsonb_build_object(
      'component_prices_visible',false,
      'basket_components_follow_template_availability',true,
      'unpriced_components_remain_fixed_quantity',true,
      'requires_backend_validation',true
    )
  );
end;
$$;

create or replace function public.set_basket_cart_item_quantity(p_cart_id uuid,p_product_id uuid,p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.cart_items%rowtype;
  v_template public.basket_template_items%rowtype;
  v_product public.products%rowtype;
  v_diff numeric;
  v_delta numeric:=0;
  v_unit_delta numeric;
begin
  if p_quantity is null or p_quantity<0 or trunc(p_quantity)<>p_quantity then raise exception 'invalid_quantity'; end if;

  select * into v_item
  from public.cart_items
  where cart_id=p_cart_id and product_id=p_product_id and source in ('basket','substitution')
  for update;
  if not found then raise exception 'basket_item_not_found'; end if;

  select * into v_template
  from public.basket_template_items
  where id=nullif(v_item.metadata->>'basket_template_item_id','')::uuid;
  if not found then raise exception 'basket_template_item_not_found'; end if;

  select * into v_product from public.products where id=p_product_id;
  if not found then raise exception 'product_missing'; end if;

  if p_quantity=0 and not v_template.removable then raise exception 'item_not_removable'; end if;
  if p_quantity<>v_template.quantity and not v_template.quantity_editable then raise exception 'quantity_not_editable'; end if;
  if p_quantity<coalesce(v_template.min_quantity,case when v_template.removable then 0 else v_template.quantity end) then raise exception 'below_min_quantity'; end if;
  if p_quantity>coalesce(v_template.max_quantity,greatest(v_template.quantity,20)) then raise exception 'above_max_quantity'; end if;

  v_diff:=p_quantity-v_template.quantity;
  if v_diff<0 then
    v_unit_delta:=coalesce(v_template.remove_unit_delta,case when coalesce(v_product.price,0)>0 then -v_product.price end);
    if v_unit_delta is null then raise exception 'remove_pricing_not_configured'; end if;
    v_delta:=abs(v_diff)*v_unit_delta;
  elsif v_diff>0 then
    v_unit_delta:=coalesce(v_template.add_unit_delta,case when coalesce(v_product.price,0)>0 then v_product.price end);
    if v_unit_delta is null then raise exception 'add_pricing_not_configured'; end if;
    v_delta:=v_diff*v_unit_delta;
  end if;

  update public.cart_items
     set quantity=p_quantity,commercial_delta=v_delta,updated_at=now()
   where id=v_item.id;
  return public.recalculate_cart(p_cart_id);
end;
$$;

revoke all on function public.get_whatsapp_basket_component_readiness_v3(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_basket_component_readiness_v3(uuid) to service_role;

-- A Meta usa PUBLISHED; internamente a definição fica READY até a abertura dos gates.
update public.experience_definitions
set status='ready',
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'handler_version','v7',
      'flow_json_version','v6',
      'basket_readiness_version','v3',
      'basket_component_availability_source','basket_template',
      'product_runtime_source','supabase.products',
      'basket_composition_source','supabase.basket_template_items',
      'unpriced_component_behavior','fixed_quantity',
      'default_component_max_quantity',20,
      'payment_on_delivery_only',true
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_status','published',
      'meta_validation_errors',0,
      'meta_validation_passed',true,
      'implementation_stage','production_readiness_v8'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

-- Mantém todos os gates desligados até o teste transacional final.
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
