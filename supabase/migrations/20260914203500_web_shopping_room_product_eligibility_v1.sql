-- Web shopping room product eligibility v1
-- Keep WhatsApp availability rules isolated in set_cart_addon_quantity.
-- The public /comprar storefront sells active, physically verified products with stock,
-- regardless of the legacy is_whatsapp_active channel flag.

create or replace function public.set_cart_web_addon_quantity(
  p_cart_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_price numeric;
  v_stock integer;
  v_limit integer;
begin
  if p_quantity is null or p_quantity < 0 or trunc(p_quantity) <> p_quantity then
    raise exception 'invalid_quantity';
  end if;
  if p_quantity > 6 then
    raise exception 'quantity_exceeds_customer_limit';
  end if;

  perform 1
    from public.carts
   where id = p_cart_id
     and status = 'draft';
  if not found then
    raise exception 'cart_not_editable';
  end if;

  select price, greatest(0, floor(coalesce(stock,0))::integer)
    into v_price, v_stock
    from public.products
   where id = p_product_id
     and physically_verified = true
     and is_active = true
     and coalesce(price,0) > 0;
  if not found then
    raise exception 'product_not_available';
  end if;

  v_limit := least(6, v_stock);
  if p_quantity > v_limit then
    raise exception 'quantity_exceeds_stock';
  end if;

  delete from public.cart_items
   where cart_id = p_cart_id
     and product_id = p_product_id
     and source = 'addon';

  if p_quantity > 0 then
    insert into public.cart_items(
      cart_id, product_id, source, quantity, unit_price, line_total,
      commercial_unit_price, metadata
    )
    values(
      p_cart_id,
      p_product_id,
      'addon',
      p_quantity,
      coalesce(v_price,0),
      p_quantity * coalesce(v_price,0),
      coalesce(v_price,0),
      jsonb_build_object(
        'pricing_source','product_price',
        'source','web_shopping_room',
        'customer_quantity_cap',6,
        'stock_at_write',v_stock
      )
    );
  end if;

  return public.recalculate_cart(p_cart_id);
end;
$function$;

create or replace function public.room_set_product_quantity(
  p_public_token text,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.catalog_sessions%rowtype;
  v_cart_id uuid;
  v_old numeric := 0;
  v_rank integer;
  v_cart jsonb;
begin
  if p_quantity is null or p_quantity < 0 or trunc(p_quantity) <> p_quantity then
    raise exception 'invalid_quantity';
  end if;
  if p_quantity > 6 then
    raise exception 'quantity_exceeds_customer_limit';
  end if;

  select *
    into v_session
    from public.catalog_sessions
   where public_token = p_public_token
     and status = 'open'
     and expires_at > now()
   for update;
  if not found then
    raise exception 'room_unavailable';
  end if;

  v_cart_id := nullif(public.ensure_shopping_room_cart(p_public_token)->>'cart_id','')::uuid;

  select quantity
    into v_old
    from public.catalog_session_items
   where catalog_session_id = v_session.id
     and product_id = p_product_id;

  if not found then
    select coalesce(max(rank),0)+1
      into v_rank
      from public.catalog_session_items
     where catalog_session_id = v_session.id;

    insert into public.catalog_session_items(
      catalog_session_id, product_id, rank, reason, recommendation_score, quantity
    )
    values(
      v_session.id,
      p_product_id,
      v_rank,
      'Escolhido na Sala de Compra',
      0,
      0
    );
    v_old := 0;
  end if;

  v_cart:=public.set_cart_web_addon_quantity(v_cart_id,p_product_id,p_quantity);

  update public.catalog_session_items
     set quantity = p_quantity,
         added_at = case when p_quantity > 0 then coalesce(added_at,now()) else null end,
         updated_at = now()
   where catalog_session_id = v_session.id
     and product_id = p_product_id;

  insert into public.catalog_events(
    catalog_session_id, customer_id, product_id, event_type, event_data
  )
  values(
    v_session.id,
    v_session.customer_id,
    p_product_id,
    case when p_quantity > v_old then 'catalog_add' else 'catalog_remove' end,
    jsonb_build_object('from',v_old,'to',p_quantity,'source','shopping_room')
  );

  update public.catalog_sessions
     set last_activity_at = now(), current_view = 'products'
   where id = v_session.id;

  update public.conversations
     set room_last_active_at = now(), updated_at = now()
   where id = v_session.conversation_id;

  return jsonb_build_object('ok',true,'quantity',p_quantity,'cart',v_cart);
end;
$function$;

revoke execute on function public.set_cart_web_addon_quantity(uuid,uuid,numeric) from public,anon,authenticated;
revoke execute on function public.room_set_product_quantity(text,uuid,numeric) from public,anon,authenticated;
