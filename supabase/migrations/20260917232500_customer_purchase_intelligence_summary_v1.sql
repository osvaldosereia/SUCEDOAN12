begin;

-- Etapa 2 — resumo inteligente do histórico de compras.
-- Derivado integralmente de orders + order_items + customer_product_stats.

create or replace view public.customer_purchase_intelligence_v1
with (security_invoker=true)
as
with valid_orders as (
  select
    o.*,
    coalesce(o.confirmed_at,o.created_at) as purchase_at
  from public.orders o
  where public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
),
ordered as (
  select
    customer_id,
    id as order_id,
    purchase_at,
    lag(purchase_at) over(partition by customer_id order by purchase_at,id) as previous_purchase_at
  from valid_orders
  where customer_id is not null
),
intervals as (
  select
    customer_id,
    avg(extract(epoch from (purchase_at-previous_purchase_at))/86400.0) as avg_interval_days,
    count(*)::int as interval_count
  from ordered
  where previous_purchase_at is not null
  group by customer_id
),
basket_rank as (
  select
    customer_id,
    basket_id,
    coalesce(nullif(basket_name_snapshot,''),'Cesta básica') as basket_name,
    count(*)::int as purchase_count,
    max(purchase_at) as last_purchase_at,
    row_number() over(
      partition by customer_id
      order by count(*) desc,max(purchase_at) desc,coalesce(nullif(basket_name_snapshot,''),'Cesta básica')
    ) as rn
  from valid_orders
  where customer_id is not null
    and (basket_id is not null or nullif(basket_name_snapshot,'') is not null)
  group by customer_id,basket_id,coalesce(nullif(basket_name_snapshot,''),'Cesta básica')
),
payment_rank as (
  select
    customer_id,
    payment_method,
    count(*)::int as use_count,
    max(purchase_at) as last_used_at,
    row_number() over(
      partition by customer_id
      order by count(*) desc,max(purchase_at) desc,payment_method
    ) as rn
  from valid_orders
  where customer_id is not null and nullif(payment_method,'') is not null
  group by customer_id,payment_method
)
select
  s.customer_id,
  s.order_count,
  s.lifetime_value,
  s.average_ticket,
  s.first_order_at,
  s.last_order_at,
  case when s.last_order_at is null then null
       else greatest(0,(current_date-s.last_order_at::date))::int end as days_since_last_order,
  s.distinct_product_count,
  s.last_order_id,
  s.last_order_number,
  s.last_order_status,
  s.last_basket_id,
  s.last_basket_name,
  s.last_payment_method,
  br.basket_id as favorite_basket_id,
  br.basket_name as favorite_basket_name,
  coalesce(br.purchase_count,0)::int as favorite_basket_purchase_count,
  pr.payment_method as favorite_payment_method,
  coalesce(pr.use_count,0)::int as favorite_payment_use_count,
  case when i.avg_interval_days is null then null else round(i.avg_interval_days::numeric,1) end as average_repurchase_interval_days,
  coalesce(i.interval_count,0)::int as repurchase_interval_samples,
  case
    when i.avg_interval_days is null then null
    when i.avg_interval_days<=10 then 'semanal'
    when i.avg_interval_days<=20 then 'quinzenal'
    when i.avg_interval_days<=45 then 'mensal'
    when i.avg_interval_days<=75 then 'bimestral'
    when i.avg_interval_days<=110 then 'trimestral'
    else 'ocasional'
  end as repurchase_frequency_label,
  case
    when s.last_order_at is null or i.avg_interval_days is null then null
    else s.last_order_at + make_interval(secs=>round(i.avg_interval_days*86400)::double precision)
  end as estimated_next_repurchase_at,
  case
    when s.order_count>=3 then 'high'
    when s.order_count=2 then 'medium'
    when s.order_count=1 then 'low'
    else 'none'
  end as history_confidence
from public.customer_purchase_summary_v1 s
left join intervals i on i.customer_id=s.customer_id
left join basket_rank br on br.customer_id=s.customer_id and br.rn=1
left join payment_rank pr on pr.customer_id=s.customer_id and pr.rn=1;

create or replace function public.get_customer_purchase_intelligence_v1(
  p_customer_id uuid,
  p_product_limit integer default 8,
  p_category_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with base as (
  select *
  from public.customer_purchase_intelligence_v1
  where customer_id=p_customer_id
),
top_products as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id',x.product_id,
      'name',x.name,
      'purchase_count',x.purchase_count,
      'total_quantity',x.total_quantity,
      'total_spent',x.total_spent,
      'last_purchase_at',x.last_purchase_at,
      'category',x.category,
      'subcategory',x.subcategory,
      'is_active',x.is_active,
      'stock',x.stock,
      'current_price',x.price
    )
    order by x.purchase_count desc,x.last_purchase_at desc,x.total_quantity desc,x.name
  ),'[]'::jsonb) as data
  from (
    select
      cps.product_id,
      coalesce(p.name,'Produto') as name,
      cps.purchase_count,
      cps.total_quantity,
      cps.total_spent,
      cps.last_purchase_at,
      coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') as category,
      coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,'')) as subcategory,
      coalesce(p.is_active,false) as is_active,
      p.stock,
      p.price
    from public.customer_product_stats cps
    left join public.products p on p.id=cps.product_id
    where cps.customer_id=p_customer_id
    order by cps.purchase_count desc,cps.last_purchase_at desc,cps.total_quantity desc,coalesce(p.name,'Produto')
    limit greatest(1,least(coalesce(p_product_limit,8),30))
  ) x
),
category_rows as (
  select
    coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') as category,
    count(distinct o.id)::int as order_count,
    count(distinct oi.product_id)::int as distinct_products,
    coalesce(sum(oi.quantity),0) as total_quantity,
    coalesce(sum(oi.line_total),0) as total_spent,
    max(coalesce(o.confirmed_at,o.created_at)) as last_purchase_at
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  left join public.products p on p.id=oi.product_id
  where o.customer_id=p_customer_id
    and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
  group by coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros')
),
top_categories as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category',x.category,
      'order_count',x.order_count,
      'distinct_products',x.distinct_products,
      'total_quantity',x.total_quantity,
      'total_spent',x.total_spent,
      'last_purchase_at',x.last_purchase_at
    )
    order by x.order_count desc,x.last_purchase_at desc,x.total_spent desc,x.category
  ),'[]'::jsonb) as data
  from (
    select *
    from category_rows
    order by order_count desc,last_purchase_at desc,total_spent desc,category
    limit greatest(1,least(coalesce(p_category_limit,5),20))
  ) x
)
select coalesce((
  select jsonb_build_object(
    'customer_id',b.customer_id,
    'order_count',b.order_count,
    'lifetime_value',b.lifetime_value,
    'average_ticket',b.average_ticket,
    'first_order_at',b.first_order_at,
    'last_order_at',b.last_order_at,
    'days_since_last_order',b.days_since_last_order,
    'distinct_product_count',b.distinct_product_count,
    'last_order',jsonb_build_object(
      'order_id',b.last_order_id,
      'order_number',b.last_order_number,
      'status',b.last_order_status
    ),
    'last_basket',case when b.last_basket_id is null and b.last_basket_name is null then null else jsonb_build_object(
      'basket_id',b.last_basket_id,
      'name',b.last_basket_name
    ) end,
    'favorite_basket',case when b.favorite_basket_id is null and b.favorite_basket_name is null then null else jsonb_build_object(
      'basket_id',b.favorite_basket_id,
      'name',b.favorite_basket_name,
      'purchase_count',b.favorite_basket_purchase_count
    ) end,
    'last_payment_method',b.last_payment_method,
    'favorite_payment_method',b.favorite_payment_method,
    'favorite_payment_use_count',b.favorite_payment_use_count,
    'average_repurchase_interval_days',b.average_repurchase_interval_days,
    'repurchase_interval_samples',b.repurchase_interval_samples,
    'repurchase_frequency_label',b.repurchase_frequency_label,
    'estimated_next_repurchase_at',b.estimated_next_repurchase_at,
    'history_confidence',b.history_confidence,
    'top_products',(select data from top_products),
    'top_categories',(select data from top_categories)
  )
  from base b
),'{}'::jsonb)
$$;

revoke all on public.customer_purchase_intelligence_v1 from public,anon,authenticated;
revoke all on function public.get_customer_purchase_intelligence_v1(uuid,integer,integer) from public,anon,authenticated;
grant select on public.customer_purchase_intelligence_v1 to service_role;
grant execute on function public.get_customer_purchase_intelligence_v1(uuid,integer,integer) to service_role;

comment on view public.customer_purchase_intelligence_v1 is
  'Resumo comercial derivado de histórico válido do cliente para Admin e Chat Comprar.';
comment on function public.get_customer_purchase_intelligence_v1(uuid,integer,integer) is
  'Retorna resumo comercial, recompra estimada, cesta/pagamento favoritos e rankings de produtos/categorias.';

commit;
