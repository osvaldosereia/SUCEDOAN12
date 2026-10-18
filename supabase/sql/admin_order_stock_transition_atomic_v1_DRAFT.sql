-- NOT DEPLOYED TO PRODUCTION. Isolated staging tested; full trigger parity pending.
-- Atomic stock + status transition with whitelisted customer/address/payment patch.
-- Vitrine cancellation release is performed by existing AFTER UPDATE status trigger.
create or replace function public.admin_order_stock_transition_atomic_v1(
  p_order_id uuid, p_expected_status text, p_next_status text,
  p_patch jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_current text;
  v_stock jsonb;
  v_source text;
  v_patch jsonb := coalesce(p_patch,'{}'::jsonb);
begin
  if p_order_id is null or p_expected_status is null or p_next_status is null then
    return jsonb_build_object('ok',false,'error','invalid_arguments');
  end if;

  if jsonb_typeof(v_patch)<>'object' or exists (
    select 1 from jsonb_object_keys(v_patch) k
    where k not in ('delivery_address','payment_method','customer_id','customer_snapshot')
  ) then
    return jsonb_build_object('ok',false,'error','invalid_patch');
  end if;

  select status,source into v_current,v_source
  from public.orders where id=p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;
  if v_current is distinct from p_expected_status then
    return jsonb_build_object('ok',false,'error','stale_order_status','current_status',v_current);
  end if;
  if not (
    (p_expected_status='created' and p_next_status='confirmed') or
    (p_next_status='cancelled' and p_expected_status in ('created','confirmed','processing','ready','out_for_delivery'))
  ) then
    return jsonb_build_object('ok',false,'error','transition_not_supported');
  end if;

  if p_next_status='confirmed' then
    v_stock:=public.reserve_vitrine_order_stock_v1(p_order_id);
  elsif v_source <> 'vitrine' then
    -- The existing orders AFTER UPDATE trigger releases vitrine orders.
    -- Other order sources still require explicit release in this transaction.
    v_stock:=public.release_vitrine_order_stock_v1(p_order_id);
  else
    v_stock:=jsonb_build_object('ok',true,'status','deferred_to_existing_status_trigger');
  end if;
  -- An exception, unlike RETURN, rolls back writes already made by the stock RPC.
  if coalesce((v_stock->>'ok')::boolean,false) is not true then
    raise exception 'stock_transition_failed: %',coalesce(v_stock->>'error','unknown')
      using errcode='P0001';
  end if;
  update public.orders
    set status=p_next_status,updated_at=now(),
        confirmed_at=case when p_next_status='confirmed' then now() else confirmed_at end,
        cancelled_at=case when p_next_status='cancelled' then now() else cancelled_at end
    ,delivery_address=case when v_patch ? 'delivery_address' then v_patch->'delivery_address' else delivery_address end,
    payment_method=case when v_patch ? 'payment_method' then v_patch->>'payment_method' else payment_method end,
    customer_id=case when v_patch ? 'customer_id' then nullif(v_patch->>'customer_id','')::uuid else customer_id end,
    customer_snapshot=case when v_patch ? 'customer_snapshot' then v_patch->'customer_snapshot' else customer_snapshot end
    where id=p_order_id;
  return jsonb_build_object('ok',true,'status',p_next_status,'stock',v_stock);
end;
$$;

revoke all on function public.admin_order_stock_transition_atomic_v1(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_order_stock_transition_atomic_v1(uuid,text,text,jsonb) to service_role;
