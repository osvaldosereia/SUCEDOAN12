begin;

create or replace function public.room_confirm_order_preview_v1(
  p_public_token text,
  p_delivery_address jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_customer public.customers%rowtype;
  v_cart public.carts%rowtype;
  v_address jsonb;
begin
  select * into v_session
  from public.catalog_sessions
  where public_token=p_public_token and status='open' and expires_at>now();
  if not found then raise exception 'room_unavailable'; end if;
  if v_session.cart_id is null then raise exception 'room_cart_unavailable'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_session.cart_id and quantity>0) then raise exception 'empty_cart'; end if;
  if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;

  select * into v_customer from public.customers where id=v_session.customer_id;
  if v_customer.name is null or v_customer.primary_whatsapp_e164 is null then raise exception 'customer_identification_required'; end if;
  if v_customer.bling_contact_id is null and nullif(regexp_replace(coalesce(v_customer.cpf_cnpj,''),'[^0-9]','','g'),'') is null then raise exception 'customer_document_required'; end if;

  v_address:=coalesce(p_delivery_address,'{}'::jsonb);
  if v_address='{}'::jsonb then
    select to_jsonb(a)-'customer_id'-'created_at'-'updated_at'
    into v_address
    from public.customer_addresses a
    where a.customer_id=v_session.customer_id and a.is_active=true
    order by a.is_default desc,a.updated_at desc
    limit 1;
  end if;
  if coalesce(v_address->>'street','')='' or coalesce(v_address->>'number','')='' or coalesce(v_address->>'city','')='' then raise exception 'delivery_address_required'; end if;

  perform public.recalculate_cart(v_session.cart_id);
  select * into v_cart from public.carts where id=v_session.cart_id;
  if not found or v_cart.status<>'draft' then raise exception 'cart_not_confirmable'; end if;
  if v_cart.pricing_status<>'ready' then raise exception 'pricing_not_ready'; end if;

  return jsonb_build_object(
    'test_mode',true,
    'would_create_order',true,
    'order_id',null,
    'cart_id',v_cart.id,
    'total',v_cart.total,
    'fiscal_subtotal',v_cart.fiscal_subtotal,
    'other_expenses',v_cart.other_expenses,
    'discount',v_cart.discount,
    'status','test_preview',
    'delivery_address',v_address,
    'customer_id',v_session.customer_id
  );
end;
$$;

revoke execute on function public.room_confirm_order_preview_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.room_confirm_order_preview_v1(text,jsonb) to service_role,postgres;

commit;
