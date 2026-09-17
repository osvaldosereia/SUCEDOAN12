begin;

-- Histórico canônico de compras por cliente.
-- Fonte de verdade: orders + order_items.

create or replace function public.is_customer_purchase_valid_v1(
  p_status text,
  p_cancelled_at timestamptz default null,
  p_returned_at timestamptz default null
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select
    p_cancelled_at is null
    and p_returned_at is null
    and coalesce(p_status,'') = any(array[
      'storefront_received',
      'confirmed',
      'sent_to_bling',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered'
    ]::text[])
$$;

create or replace function public.refresh_customer_purchase_profile(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_customer_id is null then return; end if;

  delete from public.customer_product_stats
  where customer_id=p_customer_id;

  insert into public.customer_product_stats(
    customer_id,product_id,purchase_count,total_quantity,total_spent,
    first_purchase_at,last_purchase_at,updated_at
  )
  select
    p_customer_id,
    oi.product_id,
    count(distinct o.id)::int,
    coalesce(sum(oi.quantity),0),
    coalesce(sum(oi.line_total),0),
    min(coalesce(o.confirmed_at,o.created_at)),
    max(coalesce(o.confirmed_at,o.created_at)),
    now()
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  where o.customer_id=p_customer_id
    and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
    and oi.product_id is not null
  group by oi.product_id;

  update public.customers c
  set
    order_count=x.order_count,
    lifetime_value=x.lifetime_value,
    last_order_at=x.last_order_at,
    updated_at=now()
  from (
    select
      count(*)::int as order_count,
      coalesce(sum(total),0)::numeric(14,2) as lifetime_value,
      max(coalesce(confirmed_at,created_at)) as last_order_at
    from public.orders
    where customer_id=p_customer_id
      and public.is_customer_purchase_valid_v1(status,cancelled_at,returned_at)
  ) x
  where c.id=p_customer_id;
end
$$;

drop trigger if exists trg_orders_purchase_profile on public.orders;
create trigger trg_orders_purchase_profile
after insert or update of status,total,customer_id,confirmed_at,cancelled_at,returned_at or delete
on public.orders
for each row execute function public.refresh_purchase_profile_from_order();

create index if not exists idx_orders_customer_history_v1
  on public.orders(customer_id,created_at desc)
  where customer_id is not null;

create index if not exists idx_order_items_order_history_v1
  on public.order_items(order_id);

create or replace view public.customer_purchase_summary_v1
with (security_invoker=true)
as
select
  c.id as customer_id,
  count(o.id)::int as order_count,
  coalesce(sum(o.total),0)::numeric(14,2) as lifetime_value,
  coalesce(avg(o.total),0)::numeric(14,2) as average_ticket,
  min(coalesce(o.confirmed_at,o.created_at)) as first_order_at,
  max(coalesce(o.confirmed_at,o.created_at)) as last_order_at,
  (
    select count(distinct oi.product_id)::int
    from public.orders oo
    join public.order_items oi on oi.order_id=oo.id
    where oo.customer_id=c.id
      and public.is_customer_purchase_valid_v1(oo.status,oo.cancelled_at,oo.returned_at)
      and oi.product_id is not null
  ) as distinct_product_count,
  last_order.id as last_order_id,
  last_order.order_number as last_order_number,
  last_order.status as last_order_status,
  last_order.basket_id as last_basket_id,
  last_order.basket_name_snapshot as last_basket_name,
  last_order.payment_method as last_payment_method
from public.customers c
left join public.orders o
  on o.customer_id=c.id
 and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
left join lateral (
  select oo.id,oo.order_number,oo.status,oo.basket_id,oo.basket_name_snapshot,oo.payment_method
  from public.orders oo
  where oo.customer_id=c.id
    and public.is_customer_purchase_valid_v1(oo.status,oo.cancelled_at,oo.returned_at)
  order by coalesce(oo.confirmed_at,oo.created_at) desc,oo.created_at desc,oo.id desc
  limit 1
) last_order on true
group by
  c.id,
  last_order.id,last_order.order_number,last_order.status,
  last_order.basket_id,last_order.basket_name_snapshot,last_order.payment_method;

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
    count(oi.id)::bigint,
    public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
  from public.orders o
  left join public.order_items oi on oi.order_id=o.id
  where o.customer_id=p_customer_id
  group by o.id
  order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc
  limit greatest(1,least(coalesce(p_limit,20),100))
  offset greatest(0,coalesce(p_offset,0))
$$;

create or replace function public.get_customer_last_purchase_v1(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select jsonb_build_object(
      'order_id',o.id,
      'order_number',o.order_number,
      'status',o.status,
      'source',o.source,
      'total',o.total,
      'payment_method',o.payment_method,
      'basket_id',o.basket_id,
      'basket_name',o.basket_name_snapshot,
      'created_at',o.created_at,
      'confirmed_at',o.confirmed_at,
      'delivered_at',o.delivered_at,
      'item_count',(select count(*) from public.order_items oi where oi.order_id=o.id),
      'items',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_id',oi.product_id,
            'sku',oi.sku_snapshot,
            'name',oi.name_snapshot,
            'quantity',oi.quantity,
            'unit_price',oi.unit_price,
            'line_total',oi.line_total
          )
          order by oi.created_at,oi.id
        )
        from public.order_items oi
        where oi.order_id=o.id
      ),'[]'::jsonb)
    )
    from public.orders o
    where o.customer_id=p_customer_id
      and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
    order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc
    limit 1
  ),'{}'::jsonb)
$$;

create or replace function public.get_customer_order_detail_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select jsonb_build_object(
      'order',jsonb_build_object(
        'id',o.id,
        'order_number',o.order_number,
        'status',o.status,
        'source',o.source,
        'total',o.total,
        'subtotal',o.subtotal,
        'discount',o.discount,
        'other_expenses',o.other_expenses,
        'payment_method',o.payment_method,
        'basket_id',o.basket_id,
        'basket_name',o.basket_name_snapshot,
        'delivery_address',o.delivery_address,
        'customer_snapshot',o.customer_snapshot,
        'checkout_snapshot',o.checkout_snapshot,
        'created_at',o.created_at,
        'confirmed_at',o.confirmed_at,
        'delivered_at',o.delivered_at,
        'cancelled_at',o.cancelled_at,
        'returned_at',o.returned_at,
        'counts_as_purchase',public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
      ),
      'items',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',oi.id,
            'product_id',oi.product_id,
            'sku',oi.sku_snapshot,
            'name',oi.name_snapshot,
            'quantity',oi.quantity,
            'unit_price',oi.unit_price,
            'line_total',oi.line_total,
            'metadata',oi.metadata
          )
          order by oi.created_at,oi.id
        )
        from public.order_items oi
        where oi.order_id=o.id
      ),'[]'::jsonb)
    )
    from public.orders o
    where o.id=p_order_id
      and o.customer_id=p_customer_id
  ),'{}'::jsonb)
$$;

revoke all on function public.is_customer_purchase_valid_v1(text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.get_customer_purchase_history_v1(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.get_customer_last_purchase_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_customer_order_detail_v1(uuid,uuid) from public,anon,authenticated;
revoke all on public.customer_purchase_summary_v1 from public,anon,authenticated;

grant execute on function public.is_customer_purchase_valid_v1(text,timestamptz,timestamptz) to service_role;
grant execute on function public.get_customer_purchase_history_v1(uuid,integer,integer) to service_role;
grant execute on function public.get_customer_last_purchase_v1(uuid) to service_role;
grant execute on function public.get_customer_order_detail_v1(uuid,uuid) to service_role;
grant select on public.customer_purchase_summary_v1 to service_role;

do $$
declare r record;
begin
  for r in select id from public.customers loop
    perform public.refresh_customer_purchase_profile(r.id);
  end loop;
end
$$;

commit;
