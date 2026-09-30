-- Checkout regression tests. Safe to run against a database because the whole test is rolled back.
-- Covers legacy basket checkout, product-only checkout, mixed cart and the new allocation uniqueness key.

begin;

do $$
declare
  v_basket_id uuid;
  v_lot_id uuid;
  v_product_id uuid;
  v_result jsonb;
  v_order_id uuid;
begin
  select l.basket_id,l.id
    into v_basket_id,v_lot_id
  from public.basket_stock_lots l
  join public.basket_templates b on b.id=l.basket_id
  where l.lot_kind='legacy_full'
    and l.status='ready'
    and l.quantity_available>0
    and b.is_active=true
    and coalesce(b.base_price,0)>=75
  order by b.base_price
  limit 1;

  if v_basket_id is null or v_lot_id is null then
    raise exception 'TEST_SETUP_FAIL no sellable legacy basket lot';
  end if;

  select p.id
    into v_product_id
  from public.products p
  join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
  where p.is_active=true
    and s.loose_sellable_stock>=1
    and coalesce(case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end,0)>=75
  order by p.id
  limit 1;

  if v_product_id is null then
    raise exception 'TEST_SETUP_FAIL no product above minimum order';
  end if;

  -- Legacy basket through the canonical wrapper.
  v_result := public.create_canonical_cart_order_v2(
    'vitrine','+5565999990101','PIX',
    jsonb_build_array(jsonb_build_object('type','basket','id',v_basket_id,'qty',1,'lot_id',v_lot_id)),
    jsonb_build_object('display_name','REGRESSION CHECKOUT BASKET'),
    '{}'::jsonb
  );
  v_order_id := (v_result->>'order_id')::uuid;
  if not exists(
    select 1 from public.basket_stock_allocations
    where order_id=v_order_id
      and basket_id=v_basket_id
      and lot_id=v_lot_id
      and allocation_role='legacy_full'
  ) then
    raise exception 'TEST_FAIL legacy allocation missing';
  end if;

  -- Product-only checkout.
  v_result := public.create_canonical_cart_order_v2(
    'vitrine','+5565999990102','Dinheiro',
    jsonb_build_array(jsonb_build_object('type','product','id',v_product_id,'qty',1)),
    jsonb_build_object('display_name','REGRESSION CHECKOUT PRODUCT'),
    '{}'::jsonb
  );
  v_order_id := (v_result->>'order_id')::uuid;
  if not exists(select 1 from public.order_items where order_id=v_order_id and product_id=v_product_id) then
    raise exception 'TEST_FAIL product item missing';
  end if;
  if exists(select 1 from public.basket_stock_allocations where order_id=v_order_id) then
    raise exception 'TEST_FAIL product-only order allocated basket stock';
  end if;

  -- Mixed cart.
  v_result := public.create_canonical_cart_order_v2(
    'vitrine','+5565999990103','Cartão de crédito',
    jsonb_build_array(
      jsonb_build_object('type','basket','id',v_basket_id,'qty',1,'lot_id',v_lot_id),
      jsonb_build_object('type','product','id',v_product_id,'qty',1)
    ),
    jsonb_build_object('display_name','REGRESSION CHECKOUT MIXED'),
    '{}'::jsonb
  );
  v_order_id := (v_result->>'order_id')::uuid;
  if not exists(select 1 from public.basket_stock_allocations where order_id=v_order_id and allocation_role='legacy_full') then
    raise exception 'TEST_FAIL mixed cart allocation missing';
  end if;
  if (select count(*) from public.order_items where order_id=v_order_id)<2 then
    raise exception 'TEST_FAIL mixed cart items missing';
  end if;
end
$$;

rollback;
