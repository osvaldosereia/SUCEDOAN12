create or replace function public.room_reset_open_cart_v1(p_public_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_cart public.carts%rowtype;
  v_result jsonb;
begin
  select * into v_session
    from public.catalog_sessions
   where public_token = p_public_token
     and status = 'open'
     and expires_at > now()
   for update;

  if not found then
    raise exception 'room_unavailable';
  end if;

  update public.catalog_session_items
     set quantity = 0,
         added_at = null,
         updated_at = now()
   where catalog_session_id = v_session.id;

  if v_session.cart_id is null then
    update public.catalog_sessions
       set current_view = 'start',
           checkout_started_at = null,
           last_activity_at = now()
     where id = v_session.id;

    return jsonb_build_object(
      'ok', true,
      'cart', jsonb_build_object(
        'id', null,
        'status', 'draft',
        'basket_id', null,
        'items', '[]'::jsonb,
        'total', 0,
        'commercial_total', 0
      )
    );
  end if;

  select * into v_cart
    from public.carts
   where id = v_session.cart_id
     and status = 'draft'
   for update;

  if not found then
    raise exception 'cart_not_editable';
  end if;

  delete from public.cart_items where cart_id = v_cart.id;

  update public.carts
     set basket_id = null,
         base_commercial_price = 0,
         updated_at = now()
   where id = v_cart.id;

  v_result := public.recalculate_cart(v_cart.id);

  select * into v_cart from public.carts where id = v_cart.id;

  update public.catalog_sessions
     set current_view = 'start',
         checkout_started_at = null,
         last_activity_at = now()
   where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'cart', jsonb_build_object(
      'id', v_cart.id,
      'status', v_cart.status,
      'basket_id', null,
      'items', '[]'::jsonb,
      'total', v_cart.total,
      'commercial_total', v_cart.total,
      'fiscal_subtotal', v_cart.fiscal_subtotal,
      'other_expenses', v_cart.other_expenses,
      'discount', v_cart.discount,
      'version', v_cart.version
    )
  );
end;
$$;

revoke all on function public.room_reset_open_cart_v1(text) from public, anon, authenticated;
grant execute on function public.room_reset_open_cart_v1(text) to service_role;
