begin;

-- Correção Etapa 7 — o Chat Comprar é web e não usa a flag is_whatsapp_active.
-- O histórico continua apenas ordenando ofertas válidas; nunca cria preço ou desconto.

create or replace function public.get_personalized_offers_v1(
  p_conversation_id uuid,
  p_limit integer default 100
)
returns table(
  product_id uuid,
  score numeric,
  reason text,
  bought_before boolean,
  purchase_count integer,
  last_purchase_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
with conv as (
  select c.customer_id
  from public.conversations c
  where c.id=p_conversation_id
),
cart as (
  select ca.id,ca.basket_id
  from public.carts ca
  where ca.conversation_id=p_conversation_id
    and ca.status='draft'
  order by ca.updated_at desc
  limit 1
),
in_cart as (
  select ci.product_id
  from public.cart_items ci
  join cart ca on ca.id=ci.cart_id
  where ci.quantity>0
),
stats as (
  select s.*
  from public.customer_product_stats s
  join conv c on c.customer_id=s.customer_id
),
category_affinity as (
  select
    coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros') as category_key,
    sum(s.purchase_count)::numeric as category_weight
  from stats s
  join public.products p on p.id=s.product_id
  group by coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros')
),
subcategory_affinity as (
  select
    coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,''),'') as subcategory_key,
    sum(s.purchase_count)::numeric as subcategory_weight
  from stats s
  join public.products p on p.id=s.product_id
  where coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,''),'')<>''
  group by coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,''),'')
),
recent_events as (
  select
    e.product_id,
    max(e.occurred_at) filter(where e.event_type='rejected') as last_rejected,
    count(*) filter(where e.event_type='offered' and e.occurred_at>=now()-interval '7 days') as offered_7d
  from public.sales_offer_events e
  join conv c on c.customer_id=e.customer_id
  where e.product_id is not null
    and e.occurred_at>=now()-interval '30 days'
  group by e.product_id
),
ranked as (
  select
    p.id as product_id,
    (
      20
      + case when s.product_id is not null then 50 else 0 end
      + least(coalesce(s.purchase_count,0)*8,32)
      + least(coalesce(ca.category_weight,0)*3,24)
      + least(coalesce(sa.subcategory_weight,0)*4,20)
      + case
          when exists(select 1 from cart where basket_id is not null) and p.is_upsell=true then 14
          when exists(select 1 from cart) and p.is_upsell=true then 10
          else 0
        end
      + case
          when s.last_purchase_at between now()-interval '120 days' and now()-interval '14 days' then 8
          else 0
        end
      - least(coalesce(re.offered_7d,0)*10,30)
    )::numeric as score,
    case
      when s.product_id is not null
        then 'Você já compra este produto e ele está em oferta'
      when exists(select 1 from cart where basket_id is not null) and p.is_upsell=true
        then 'Combina com a cesta que está no seu pedido'
      when exists(select 1 from cart) and p.is_upsell=true
        then 'Complementa o que já está no seu pedido'
      when coalesce(sa.subcategory_weight,0)>0
        then 'Oferta em um tipo de produto que você costuma comprar'
      when coalesce(ca.category_weight,0)>0
        then 'Oferta em uma categoria que você costuma comprar'
      else 'Está em oferta hoje'
    end as reason,
    (s.product_id is not null) as bought_before,
    coalesce(s.purchase_count,0)::int as purchase_count,
    s.last_purchase_at,
    p.sort_order,
    p.name
  from public.products p
  left join stats s on s.product_id=p.id
  left join category_affinity ca
    on ca.category_key=coalesce(nullif(p.customer_category,''),nullif(p.category,''),'Outros')
  left join subcategory_affinity sa
    on sa.subcategory_key=coalesce(nullif(p.customer_subcategory,''),nullif(p.subcategory,''),'')
  left join recent_events re on re.product_id=p.id
  where p.is_offer=true
    and p.physically_verified=true
    and p.is_active=true
    and coalesce(p.stock,0)>0
    and coalesce(p.price,0)>0
    and not exists(select 1 from in_cart x where x.product_id=p.id)
    and (re.last_rejected is null or re.last_rejected<now()-interval '30 days')
)
select product_id,score,reason,bought_before,purchase_count,last_purchase_at
from ranked
order by score desc,sort_order asc nulls last,name asc
limit greatest(1,least(coalesce(p_limit,100),100))
$$;

revoke all on function public.get_personalized_offers_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_personalized_offers_v1(uuid,integer) to service_role;

comment on function public.get_personalized_offers_v1(uuid,integer) is
  'Ordena apenas ofertas comerciais válidas usando histórico, afinidade e carrinho atual, sem alterar preços.';

commit;
