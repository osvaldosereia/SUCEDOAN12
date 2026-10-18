-- NOT DEPLOYED. Requires staging equivalence and transaction/rollback tests.
-- Atomic stock + status transition. Does not handle customer/address patch fields.
create or replace function public.admin_order_stock_transition_atomic_v1(
  p_order_id uuid, p_expected_status text, p_next_status text
) returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_current text;
  v_stock jsonb;
begin
  if p_order_id is null or p_expected_status is null or p_next_status is null then
    return jsonb_build_object('ok',false,'error','invalid_arguments');
  end if;

  select status into v_current
  from public.orders where id=p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;
  if v_current=p_next_status then
    return jsonb_build_object('ok',true,'already_applied',true,'status',v_current);
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
  else
    v_stock:=public.release_vitrine_order_stock_v1(p_order_id);
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
    where id=p_order_id;
  return jsonb_build_object('ok',true,'status',p_next_status,'stock',v_stock);
end;
$$;

revoke all on function public.admin_order_stock_transition_atomic_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_order_stock_transition_atomic_v1(uuid,text,text) to service_role;
