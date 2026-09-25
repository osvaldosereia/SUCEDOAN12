-- Dona Antonia Operations 2.0
-- Canonical multichannel order wrapper.
-- Reuses the deterministic Vitrine basket/order engine atomically.

create or replace function public.create_canonical_cart_order_v2(
  p_source text,
  p_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v_source text:=lower(trim(coalesce(p_source,'')));
  v_result jsonb;
  v_order_id uuid;
begin
  if v_source not in ('vitrine','manual_whatsapp','papoai','reorder') then
    raise exception 'invalid_order_source';
  end if;

  v_result:=public.create_vitrine_cart_order_v1(
    p_phone,p_payment_method,p_items,p_customer_snapshot,p_delivery
  );

  v_order_id:=(v_result->>'order_id')::uuid;

  update public.orders
     set source=v_source,
         idempotency_key=case
           when v_source='vitrine' then idempotency_key
           else v_source||'-direct:'||v_order_id::text
         end,
         checkout_snapshot=coalesce(checkout_snapshot,'{}'::jsonb)
           || jsonb_build_object('canonical_source',v_source,'canonical_engine','create_canonical_cart_order_v2'),
         updated_at=now()
   where id=v_order_id;

  if v_source<>'vitrine' then
    update public.order_items
       set metadata=coalesce(metadata,'{}'::jsonb)
         || jsonb_build_object('source',v_source,'canonical_engine','create_canonical_cart_order_v2')
     where order_id=v_order_id;
  end if;

  return v_result||jsonb_build_object('source',v_source,'canonical_engine','v2');
end;
$$;

revoke all on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.create_canonical_cart_order_v2(text,text,text,jsonb,jsonb,jsonb)
  to service_role;
