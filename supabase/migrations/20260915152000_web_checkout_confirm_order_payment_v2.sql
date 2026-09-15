begin;

create or replace function public.room_confirm_web_order_v2(
  p_public_token text,
  p_delivery_address jsonb default '{}'::jsonb,
  p_payment_method text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_customer public.customers%rowtype;
  v_address jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_order_source text;
  v_payment text:=lower(trim(coalesce(p_payment_method,'')));
begin
  if v_payment not in ('pix','credit_card','meal_card','cash') then
    raise exception 'payment_method_required';
  end if;

  select * into v_session
    from public.catalog_sessions
   where public_token=p_public_token
     and status='open'
     and expires_at>now()
   for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_session.cart_id is null then raise exception 'room_cart_unavailable'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_session.cart_id and quantity>0) then raise exception 'empty_cart'; end if;
  if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;

  select * into v_customer from public.customers where id=v_session.customer_id;
  if not found or v_customer.name is null or v_customer.primary_whatsapp_e164 is null then
    raise exception 'customer_identification_required';
  end if;

  v_address:=coalesce(p_delivery_address,'{}'::jsonb);
  if v_address='{}'::jsonb then
    select to_jsonb(a)-'customer_id'-'created_at'-'updated_at'
      into v_address
      from public.customer_addresses a
     where a.customer_id=v_session.customer_id
       and a.is_active=true
     order by a.is_default desc,a.updated_at desc
     limit 1;
  end if;
  if coalesce(v_address->>'street','')='' or coalesce(v_address->>'number','')='' or coalesce(v_address->>'city','')='' then
    raise exception 'delivery_address_required';
  end if;

  v_result:=public.confirm_cart_order(v_session.cart_id,v_address);
  if coalesce(v_result->>'order_id','')='' then raise exception 'order_persistence_failed'; end if;
  v_order_id:=(v_result->>'order_id')::uuid;

  update public.orders
     set payment_method=v_payment,
         updated_at=now()
   where id=v_order_id
   returning order_number,source into v_order_number,v_order_source;
  if not found then raise exception 'order_persistence_failed'; end if;

  if not exists(select 1 from public.order_items oi where oi.order_id=v_order_id) then
    raise exception 'order_items_persistence_failed';
  end if;

  update public.catalog_sessions
     set status='closed',
         closed_at=now(),
         completed_at=now(),
         last_activity_at=now(),
         current_view='success',
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('payment_method',v_payment)
   where id=v_session.id;

  insert into public.catalog_events(catalog_session_id,customer_id,event_type,event_data)
  values(v_session.id,v_session.customer_id,'catalog_checkout_return',jsonb_build_object('source','shopping_room','order_id',v_order_id,'order_number',v_order_number,'payment_method',v_payment));

  if v_session.conversation_id is not null then
    insert into public.customer_behavior_events(customer_id,conversation_id,event_type,event_data)
    values(v_session.customer_id,v_session.conversation_id,'room_order_confirmed',jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'payment_method',v_payment));

    update public.conversations
       set stage='order_confirmed',status='waiting_customer',updated_at=now()
     where id=v_session.conversation_id;
  end if;

  return v_result||jsonb_strip_nulls(jsonb_build_object(
    'delivery_address',v_address,
    'payment_method',v_payment,
    'order_number',v_order_number,
    'source',v_order_source,
    'catalog_session_id',v_session.id
  ));
end;
$$;

revoke all on function public.room_confirm_web_order_v2(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.room_confirm_web_order_v2(text,jsonb,text) to service_role;

commit;
