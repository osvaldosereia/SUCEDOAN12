create or replace function public.sync_vitrine_order_fiscal_delivery_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found','external_side_effect',false);
  end if;

  insert into public.order_fiscal_controls(order_id,delivery_status,delivery_confirmed_at)
  values(
    o.id,
    case
      when o.status='delivered' then 'delivered'
      when o.status='cancelled' then 'cancelled'
      when o.status='returned' then 'returned'
      else 'pending'
    end,
    case when o.status='delivered' then coalesce(o.delivered_at,now()) else null end
  )
  on conflict(order_id) do nothing;

  update public.order_fiscal_controls
  set delivery_status=case
        when o.status='delivered' then 'delivered'
        when o.status='cancelled' then 'cancelled'
        when o.status='returned' then 'returned'
        else delivery_status
      end,
      delivery_confirmed_at=case
        when o.status='delivered' then coalesce(delivery_confirmed_at,o.delivered_at,now())
        else delivery_confirmed_at
      end,
      updated_at=now()
  where order_id=o.id;

  return public.refresh_order_fiscal_readiness_v1(o.id);
end
$$;

revoke all on function public.sync_vitrine_order_fiscal_delivery_v1(uuid) from public,anon,authenticated;
grant execute on function public.sync_vitrine_order_fiscal_delivery_v1(uuid) to service_role;
