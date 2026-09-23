
create or replace function public.get_customer_purchase_history_v1(
  p_customer_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  order_id uuid,
  order_number text,
  status text,
  source text,
  total numeric,
  payment_method text,
  basket_id uuid,
  basket_name text,
  created_at timestamptz,
  confirmed_at timestamptz,
  delivered_at timestamptz,
  item_count bigint,
  counts_as_purchase boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select
    o.id,
    o.order_number,
    o.status,
    o.source,
    o.total,
    o.payment_method,
    o.basket_id,
    o.basket_name_snapshot,
    o.created_at,
    o.confirmed_at,
    o.delivered_at,
    count(oi.id) filter (
      where coalesce(oi.metadata->>'history_kind','') <> 'basket_component'
    )::bigint,
    public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
  from public.orders o
  left join public.order_items oi on oi.order_id=o.id
  where o.customer_id=p_customer_id
  group by o.id
  order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc
  limit greatest(1,least(coalesce(p_limit,20),100))
  offset greatest(0,coalesce(p_offset,0))
$$;

revoke all on function public.get_customer_purchase_history_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_customer_purchase_history_v1(uuid,integer,integer) to service_role;
