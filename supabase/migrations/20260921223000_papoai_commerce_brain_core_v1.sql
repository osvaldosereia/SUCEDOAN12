begin;

create table if not exists public.papoai_commerce_brain_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default false,
  write_enabled boolean not null default false,
  ai_enabled boolean not null default false,
  basket_reads_enabled boolean not null default true,
  product_reads_enabled boolean not null default true,
  offers_enabled boolean not null default true,
  upsell_enabled boolean not null default true,
  max_history_messages smallint not null default 12 check(max_history_messages between 4 and 30),
  max_product_results smallint not null default 6 check(max_product_results between 1 and 12),
  component_prices_visible boolean not null default false check(component_prices_visible=false),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.papoai_commerce_brain_config(id)
values(1)
on conflict(id) do nothing;

alter table public.papoai_commerce_brain_config enable row level security;
revoke all on table public.papoai_commerce_brain_config from public,anon,authenticated;
grant all on table public.papoai_commerce_brain_config to service_role;

create table if not exists public.papoai_commerce_turns (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  adapter_id uuid references public.channel_provider_adapters(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  provider_session_key text,
  intent text not null,
  action_kind text not null default 'read',
  response_kind text not null default 'text',
  tool_calls jsonb not null default '[]'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  duration_ms integer check(duration_ms is null or duration_ms>=0),
  created_at timestamptz not null default now()
);

create index if not exists papoai_commerce_turns_conversation_created_idx
  on public.papoai_commerce_turns(conversation_id,created_at desc);

alter table public.papoai_commerce_turns enable row level security;
revoke all on table public.papoai_commerce_turns from public,anon,authenticated;
grant all on table public.papoai_commerce_turns to service_role;

create or replace function public.get_papoai_commerce_brain_config_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select to_jsonb(c)
  from public.papoai_commerce_brain_config c
  where c.id=1;
$$;
revoke all on function public.get_papoai_commerce_brain_config_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_brain_config_v1() to service_role;

create or replace function public.get_papoai_commerce_basket_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',b.id,
      'sku',b.sku,
      'name',b.name,
      'display_name',case when lower(b.name)='economica bonini' then 'Econômica Bonini' else b.name end,
      'commercial_price',b.base_price,
      'image_url',b.image_url,
      'item_lines',x.item_lines,
      'unit_count',x.unit_count
    )
    order by b.sort_order,b.name
  ),'[]'::jsonb)
  from public.basket_templates b
  cross join lateral (
    select count(*)::integer as item_lines,
           coalesce(sum(i.quantity),0) as unit_count
    from public.basket_template_items i
    where i.basket_id=b.id
  ) x
  where b.is_active=true and b.is_whatsapp_active=true;
$$;
revoke all on function public.get_papoai_commerce_basket_catalog_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_basket_catalog_v1() to service_role;

create or replace function public.get_papoai_commerce_basket_detail_v1(p_basket_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_match jsonb;
  v_basket_id uuid;
  v_items jsonb;
begin
  v_match:=public.get_whatsapp_basket_contents_v1(p_basket_query);
  if not coalesce((v_match->>'found')::boolean,false) then
    return v_match;
  end if;

  v_basket_id:=(v_match#>>'{basket,id}')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',p.id,
    'name',p.name,
    'quantity',bi.quantity,
    'sort_order',bi.sort_order,
    'category',p.category,
    'customer_category',p.customer_category,
    'image_url',p.image_url,
    'removable',bi.removable,
    'quantity_editable',bi.quantity_editable,
    'min_quantity',bi.min_quantity,
    'max_quantity',bi.max_quantity
  ) order by bi.sort_order,p.name),'[]'::jsonb)
  into v_items
  from public.basket_template_items bi
  join public.products p on p.id=bi.product_id
  where bi.basket_id=v_basket_id;

  return v_match || jsonb_build_object(
    'items',v_items,
    'item_count',jsonb_array_length(v_items),
    'component_prices_included',false,
    'component_costs_included',false,
    'hidden_adjustment_included',false
  );
end;
$$;
revoke all on function public.get_papoai_commerce_basket_detail_v1(text) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_basket_detail_v1(text) to service_role;

create or replace function public.get_papoai_commerce_customer_context_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_conv
  from public.conversations
  where id=p_conversation_id;
  if not found then
    return jsonb_build_object('known',false,'reason','conversation_not_found');
  end if;

  if v_conv.customer_id is not null then
    select * into v_customer from public.customers where id=v_conv.customer_id;
  end if;

  select * into v_order
  from public.orders o
  where (
    (v_customer.id is not null and o.customer_id=v_customer.id)
    or (v_customer.id is null and o.phone_e164=v_conv.wa_contact_e164)
  )
    and o.status not in ('cancelled','returned')
  order by coalesce(o.confirmed_at,o.created_at) desc
  limit 1;

  return jsonb_build_object(
    'known',v_customer.id is not null,
    'customer_id',v_customer.id,
    'name',v_customer.name,
    'preferred_reply',coalesce(v_customer.preferred_reply,'auto'),
    'order_count',coalesce(v_customer.order_count,0),
    'last_order_at',coalesce(v_customer.last_order_at,v_order.confirmed_at,v_order.created_at),
    'last_order',case when v_order.id is null then null else jsonb_build_object(
      'order_id',v_order.id,
      'basket_id',v_order.basket_id,
      'basket_name',v_order.basket_name_snapshot,
      'total',v_order.total,
      'status',v_order.status,
      'payment_method',v_order.payment_method,
      'created_at',v_order.created_at
    ) end
  );
end;
$$;
revoke all on function public.get_papoai_commerce_customer_context_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_customer_context_v1(uuid) to service_role;

create or replace function public.get_papoai_commerce_cart_state_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cart public.carts%rowtype;
  v_basket public.basket_templates%rowtype;
  v_items jsonb;
begin
  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('has_cart',false);
  end if;

  if v_cart.basket_id is not null then
    select * into v_basket from public.basket_templates where id=v_cart.basket_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',p.id,
    'name',p.name,
    'source',ci.source,
    'quantity',ci.quantity,
    'base_quantity',ci.base_quantity,
    'category',p.category,
    'customer_category',p.customer_category,
    'image_url',p.image_url,
    'is_offer',p.is_offer,
    'offer_price',case when ci.source='addon' and p.is_offer then p.offer_price else null end,
    'commercial_unit_price',case when ci.source='addon' then ci.commercial_unit_price else null end,
    'commercial_line_total',case when ci.source='addon' then ci.quantity*coalesce(ci.commercial_unit_price,p.price,0) else null end,
    'changed',case when ci.source in ('basket','substitution') then coalesce(ci.quantity,0)<>coalesce(ci.base_quantity,ci.quantity,0) or coalesce(ci.commercial_delta,0)<>0 else false end,
    'metadata',case when ci.source='substitution' then ci.metadata else '{}'::jsonb end
  ) order by ci.created_at,p.name),'[]'::jsonb)
  into v_items
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.cart_id=v_cart.id
    and ci.quantity>0;

  return jsonb_build_object(
    'has_cart',true,
    'cart_id',v_cart.id,
    'basket',case when v_basket.id is null then null else jsonb_build_object(
      'id',v_basket.id,
      'name',v_basket.name,
      'display_name',case when lower(v_basket.name)='economica bonini' then 'Econômica Bonini' else v_basket.name end,
      'base_commercial_price',v_cart.base_commercial_price,
      'image_url',v_basket.image_url
    ) end,
    'total',v_cart.total,
    'pricing_status',v_cart.pricing_status,
    'version',v_cart.version,
    'items',v_items,
    'component_prices_visible',false,
    'hidden_adjustment_visible',false
  );
end;
$$;
revoke all on function public.get_papoai_commerce_cart_state_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_cart_state_v1(uuid) to service_role;

create or replace function public.start_papoai_commerce_basket_v1(
  p_conversation_id uuid,
  p_basket_query text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_detail jsonb;
  v_basket_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  v_detail:=public.get_papoai_commerce_basket_detail_v1(p_basket_query);
  if not coalesce((v_detail->>'found')::boolean,false) then
    return v_detail;
  end if;
  v_basket_id:=(v_detail#>>'{basket,id}')::uuid;

  perform public.start_basket_cart(p_conversation_id,v_basket_id);
  return jsonb_build_object(
    'ok',true,
    'basket',v_detail->'basket',
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id)
  );
end;
$$;
revoke all on function public.start_papoai_commerce_basket_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.start_papoai_commerce_basket_v1(uuid,text) to service_role;

create or replace function public.set_papoai_commerce_basket_quantity_v1(
  p_conversation_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  select id into v_cart_id
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if v_cart_id is null then raise exception 'cart_not_found'; end if;

  perform public.set_basket_cart_item_quantity(v_cart_id,p_product_id,p_quantity);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;
revoke all on function public.set_papoai_commerce_basket_quantity_v1(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_basket_quantity_v1(uuid,uuid,numeric) to service_role;

create or replace function public.set_papoai_commerce_addon_quantity_v1(
  p_conversation_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_product public.products%rowtype;
  v_commercial_price numeric;
  v_stock integer;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  if p_quantity is null or p_quantity<0 or trunc(p_quantity)<>p_quantity or p_quantity>6 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_product
  from public.products
  where id=p_product_id
    and physically_verified=true
    and is_active=true
    and is_whatsapp_active=true
    and coalesce(price,0)>0;
  if not found then raise exception 'product_not_available'; end if;

  v_stock:=greatest(0,floor(coalesce(v_product.stock,0))::integer);
  if p_quantity>least(6,v_stock) then raise exception 'quantity_exceeds_stock'; end if;

  if exists(
    select 1 from public.cart_items
    where cart_id=v_cart.id and product_id=p_product_id
      and source in ('basket','substitution') and quantity>0
  ) then
    raise exception 'product_already_in_basket';
  end if;

  v_commercial_price:=case
    when v_product.is_offer
      and coalesce(v_product.offer_price,0)>0
      and v_product.offer_price<=v_product.price
      then v_product.offer_price
    else v_product.price
  end;

  delete from public.cart_items
  where cart_id=v_cart.id and product_id=p_product_id and source='addon';

  if p_quantity>0 then
    insert into public.cart_items(
      cart_id,product_id,source,quantity,unit_price,line_total,
      commercial_unit_price,metadata
    ) values(
      v_cart.id,v_product.id,'addon',p_quantity,v_product.price,
      p_quantity*v_product.price,v_commercial_price,
      jsonb_build_object(
        'pricing_source',case when v_commercial_price<>v_product.price then 'offer_price' else 'product_price' end,
        'regular_price',v_product.price,
        'commercial_price',v_commercial_price,
        'stock_at_write',v_stock,
        'source','papoai_commerce'
      )
    );
  end if;

  perform public.recalculate_cart(v_cart.id);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;
revoke all on function public.set_papoai_commerce_addon_quantity_v1(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_addon_quantity_v1(uuid,uuid,numeric) to service_role;

create or replace function public.replace_papoai_commerce_basket_item_v1(
  p_conversation_id uuid,
  p_source_product_id uuid,
  p_replacement_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_source public.cart_items%rowtype;
  v_source_product public.products%rowtype;
  v_target public.products%rowtype;
  v_target_commercial numeric;
  v_qty numeric;
  v_source_base numeric;
  v_source_price numeric;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;
  if p_source_product_id=p_replacement_product_id then raise exception 'replacement_same_product'; end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_source
  from public.cart_items
  where cart_id=v_cart.id
    and product_id=p_source_product_id
    and source='basket'
    and quantity>0
  limit 1
  for update;
  if not found then raise exception 'basket_source_product_not_found'; end if;

  select * into v_source_product from public.products where id=p_source_product_id;
  if not found then raise exception 'source_product_missing'; end if;

  select * into v_target
  from public.products
  where id=p_replacement_product_id
    and physically_verified=true
    and is_active=true
    and is_whatsapp_active=true
    and coalesce(price,0)>0
    and coalesce(stock,0)>0;
  if not found then raise exception 'replacement_product_unavailable'; end if;

  v_qty:=v_source.quantity;
  if v_target.stock<v_qty then raise exception 'replacement_insufficient_stock'; end if;

  if exists(
    select 1 from public.cart_items
    where cart_id=v_cart.id and product_id=p_replacement_product_id and quantity>0
  ) then
    raise exception 'replacement_already_in_cart';
  end if;

  v_source_base:=coalesce(v_source.base_quantity,v_source.quantity);
  v_source_price:=coalesce(v_source_product.price,v_source.unit_price,0);
  if v_source_price<=0 then raise exception 'source_price_missing'; end if;

  v_target_commercial:=case
    when v_target.is_offer
      and coalesce(v_target.offer_price,0)>0
      and v_target.offer_price<=v_target.price
      then v_target.offer_price
    else v_target.price
  end;

  update public.cart_items
     set quantity=0,
         commercial_delta=-(v_source_base*v_source_price),
         updated_at=now()
   where id=v_source.id;

  insert into public.cart_items(
    cart_id,product_id,source,quantity,base_quantity,unit_price,line_total,
    commercial_delta,commercial_unit_price,metadata
  ) values(
    v_cart.id,v_target.id,'substitution',v_qty,0,v_target.price,
    v_qty*v_target.price,v_qty*v_target_commercial,v_target_commercial,
    jsonb_build_object(
      'substitution',true,
      'replaces_product_id',v_source_product.id,
      'replaces_product_name',v_source_product.name,
      'replacement_product_id',v_target.id,
      'replacement_product_name',v_target.name,
      'commercial_price',v_target_commercial,
      'source','papoai_commerce'
    )
  );

  perform public.recalculate_cart(v_cart.id);
  return public.get_papoai_commerce_cart_state_v1(p_conversation_id);
end;
$$;
revoke all on function public.replace_papoai_commerce_basket_item_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_papoai_commerce_basket_item_v1(uuid,uuid,uuid) to service_role;

commit;
