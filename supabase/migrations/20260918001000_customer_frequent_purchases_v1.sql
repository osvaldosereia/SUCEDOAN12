begin;

-- Etapa 5 — área "Minhas compras frequentes".
-- Ranking baseado em pedidos distintos, recência, quantidade total e disponibilidade atual.

create or replace function public.get_customer_frequent_purchases_v1(
  p_customer_id uuid,
  p_product_limit integer default 10,
  p_extra_limit integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with intel as (
  select *
  from public.customer_purchase_intelligence_v1
  where customer_id=p_customer_id
),
frequent_products as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id',x.product_id,
      'name',x.name,
      'image_url',x.image_url,
      'brand',x.brand,
      'packaging',x.packaging,
      'category',x.category,
      'purchase_count',x.purchase_count,
      'total_quantity',x.total_quantity,
      'last_purchase_at',x.last_purchase_at,
      'days_since_last_purchase',x.days_since_last_purchase,
      'current_price',x.current_price,
      'stock',x.stock,
      'available',x.available,
      'max_addable_quantity',x.max_addable_quantity
    )
    order by x.purchase_count desc,x.last_purchase_at desc,x.total_quantity desc,x.available desc,x.name
  ),'[]'::jsonb) as data
  from (
    select
      cps.product_id,
      coalesce(p.name,'Produto') as name,
      p.image_url,
      p.brand,
      p.packaging,
      coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') as category,
      cps.purchase_count,
      cps.total_quantity,
      cps.last_purchase_at,
      greatest(0,(current_date-cps.last_purchase_at::date))::int as days_since_last_purchase,
      coalesce(p.price,0)::numeric as current_price,
      greatest(0,floor(coalesce(p.stock,0)))::int as stock,
      (
        p.id is not null
        and p.physically_verified=true
        and p.is_active=true
        and p.is_whatsapp_active=true
        and coalesce(p.stock,0)>0
        and coalesce(p.price,0)>0
      ) as available,
      case
        when p.id is not null
         and p.physically_verified=true
         and p.is_active=true
         and p.is_whatsapp_active=true
         and coalesce(p.stock,0)>0
         and coalesce(p.price,0)>0
        then least(6,greatest(0,floor(coalesce(p.stock,0)))::int)
        else 0
      end as max_addable_quantity
    from public.customer_product_stats cps
    left join public.products p on p.id=cps.product_id
    where cps.customer_id=p_customer_id
      and cps.purchase_count>=2
    order by
      cps.purchase_count desc,
      cps.last_purchase_at desc,
      cps.total_quantity desc,
      (
        p.id is not null
        and p.physically_verified=true
        and p.is_active=true
        and p.is_whatsapp_active=true
        and coalesce(p.stock,0)>0
        and coalesce(p.price,0)>0
      ) desc,
      coalesce(p.name,'Produto')
    limit greatest(1,least(coalesce(p_product_limit,10),30))
  ) x
),
extra_stats as (
  select
    oi.product_id,
    count(distinct o.id)::int as purchase_count,
    coalesce(sum(oi.quantity),0) as total_quantity,
    max(coalesce(o.confirmed_at,o.created_at)) as last_purchase_at,
    (array_agg(oi.quantity order by coalesce(o.confirmed_at,o.created_at) desc,oi.created_at desc,oi.id desc))[1] as last_quantity
  from public.orders o
  join public.order_items oi on oi.order_id=o.id
  where o.customer_id=p_customer_id
    and public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
    and coalesce(oi.metadata->>'source','')='addon'
    and oi.product_id is not null
  group by oi.product_id
),
recent_extras as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id',x.product_id,
      'name',x.name,
      'image_url',x.image_url,
      'purchase_count',x.purchase_count,
      'total_quantity',x.total_quantity,
      'last_quantity',x.last_quantity,
      'last_purchase_at',x.last_purchase_at,
      'current_price',x.current_price,
      'stock',x.stock,
      'available',x.available
    )
    order by x.last_purchase_at desc,x.purchase_count desc,x.total_quantity desc,x.name
  ),'[]'::jsonb) as data
  from (
    select
      es.product_id,
      coalesce(p.name,'Produto') as name,
      p.image_url,
      es.purchase_count,
      es.total_quantity,
      es.last_quantity,
      es.last_purchase_at,
      coalesce(p.price,0)::numeric as current_price,
      greatest(0,floor(coalesce(p.stock,0)))::int as stock,
      (
        p.id is not null
        and p.physically_verified=true
        and p.is_active=true
        and p.is_whatsapp_active=true
        and coalesce(p.stock,0)>0
        and coalesce(p.price,0)>0
      ) as available
    from extra_stats es
    left join public.products p on p.id=es.product_id
    order by es.last_purchase_at desc,es.purchase_count desc,es.total_quantity desc,coalesce(p.name,'Produto')
    limit greatest(1,least(coalesce(p_extra_limit,6),20))
  ) x
),
favorite_basket as (
  select case
    when i.favorite_basket_id is null and i.favorite_basket_name is null then null
    else jsonb_build_object(
      'basket_id',i.favorite_basket_id,
      'name',coalesce(b.name,i.favorite_basket_name,'Cesta básica'),
      'purchase_count',i.favorite_basket_purchase_count,
      'current_price',b.base_price,
      'image_url',b.image_url,
      'available',(
        b.id is not null
        and b.is_active=true
        and b.is_whatsapp_active=true
      )
    )
  end as data
  from intel i
  left join public.basket_templates b on b.id=i.favorite_basket_id
)
select coalesce((
  select jsonb_build_object(
    'customer_id',i.customer_id,
    'has_history',i.order_count>0,
    'order_count',i.order_count,
    'frequency_label',i.repurchase_frequency_label,
    'average_interval_days',i.average_repurchase_interval_days,
    'history_confidence',i.history_confidence,
    'favorite_basket',(select data from favorite_basket),
    'frequent_products',(select data from frequent_products),
    'recent_extras',(select data from recent_extras)
  )
  from intel i
),'{}'::jsonb)
$$;

revoke all on function public.get_customer_frequent_purchases_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_customer_frequent_purchases_v1(uuid,integer,integer) to service_role;

comment on function public.get_customer_frequent_purchases_v1(uuid,integer,integer) is
  'Retorna hábitos comerciais reais do cliente para a área Minhas compras frequentes, priorizando pedidos distintos, recência e quantidade total.';

commit;
