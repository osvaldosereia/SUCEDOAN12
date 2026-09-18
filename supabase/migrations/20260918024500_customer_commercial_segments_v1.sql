begin;

-- Etapa 9 — segmentos comerciais derivados de regras objetivas.
-- Nenhum segmento é gravado manualmente; tudo é recalculado a partir de pedidos válidos.

create or replace view public.customer_commercial_segments_v1 as
with ranked_value as (
  select
    coalesce(
      percentile_cont(0.80) within group(order by lifetime_value)
        filter(where order_count>0),
      0
    )::numeric as p80_lifetime
  from public.customer_purchase_intelligence_v1
),
basket_stats as (
  select
    o.customer_id,
    count(*) filter(
      where public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
    )::int as valid_orders,
    count(*) filter(
      where public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
        and o.basket_id is not null
    )::int as basket_orders
  from public.orders o
  where o.customer_id is not null
  group by o.customer_id
),
base as (
  select
    i.*,
    coalesce(bs.valid_orders,0)::int as valid_orders,
    coalesce(bs.basket_orders,0)::int as basket_orders,
    rv.p80_lifetime,
    case
      when i.average_repurchase_interval_days is not null
        then greatest(60,ceil(i.average_repurchase_interval_days*2))::int
      else 90
    end as inactive_after_days,
    case
      when i.average_repurchase_interval_days is not null
        then floor(i.average_repurchase_interval_days*0.80)::int
      else null
    end as due_from_days,
    case
      when i.average_repurchase_interval_days is not null
        then ceil(i.average_repurchase_interval_days*1.30)::int
      else null
    end as due_until_days
  from public.customer_purchase_intelligence_v1 i
  cross join ranked_value rv
  left join basket_stats bs on bs.customer_id=i.customer_id
),
flags as (
  select
    b.*,
    (b.order_count=1) as is_first_buyer,
    (b.order_count>=2) as is_recurring,
    (
      b.order_count>=3
      and b.average_repurchase_interval_days between 20 and 40
      and b.days_since_last_order<=ceil(b.average_repurchase_interval_days*1.5)
    ) as is_monthly,
    (
      b.order_count>0
      and b.days_since_last_order>=b.inactive_after_days
    ) as is_inactive,
    (
      b.order_count>0
      and b.p80_lifetime>0
      and b.lifetime_value>=b.p80_lifetime
    ) as is_high_value,
    (b.basket_orders>0) as is_basket_buyer,
    (b.valid_orders>0 and b.basket_orders=0) as is_product_only_buyer,
    (
      b.favorite_basket_id is not null
      and coalesce(b.favorite_basket_purchase_count,0)>=2
    ) as has_favorite_basket,
    (
      b.order_count>=2
      and b.average_repurchase_interval_days is not null
      and b.days_since_last_order between b.due_from_days and b.due_until_days
      and b.days_since_last_order<b.inactive_after_days
    ) as is_near_repurchase
  from base b
)
select
  f.customer_id,
  f.order_count,
  f.lifetime_value,
  f.average_ticket,
  f.first_order_at,
  f.last_order_at,
  f.days_since_last_order,
  f.average_repurchase_interval_days,
  f.estimated_next_repurchase_at,
  f.favorite_basket_id,
  f.favorite_basket_name,
  f.favorite_basket_purchase_count,
  f.basket_orders,
  f.valid_orders,
  f.p80_lifetime as high_value_threshold,
  f.inactive_after_days,
  f.due_from_days,
  f.due_until_days,
  f.is_first_buyer,
  f.is_recurring,
  f.is_monthly,
  f.is_inactive,
  f.is_high_value,
  f.is_basket_buyer,
  f.is_product_only_buyer,
  f.has_favorite_basket,
  f.is_near_repurchase,
  array_remove(array[
    case when f.is_first_buyer then 'primeiro_comprador' end,
    case when f.is_recurring then 'recorrente' end,
    case when f.is_monthly then 'mensal' end,
    case when f.is_inactive then 'inativo' end,
    case when f.is_high_value then 'alto_valor' end,
    case when f.is_basket_buyer then 'comprador_cesta' end,
    case when f.is_product_only_buyer then 'produtos_avulsos' end,
    case when f.has_favorite_basket then 'cesta_favorita' end,
    case when f.is_near_repurchase then 'proximo_recompra' end
  ],null)::text[] as segments,
  jsonb_strip_nulls(jsonb_build_object(
    'primeiro_comprador',case when f.is_first_buyer then 'Possui exatamente 1 pedido válido' end,
    'recorrente',case when f.is_recurring then 'Possui 2 ou mais pedidos válidos' end,
    'mensal',case when f.is_monthly then 'Tem 3+ pedidos e intervalo médio entre 20 e 40 dias, ainda dentro do ritmo esperado' end,
    'inativo',case when f.is_inactive then format('Sem compra há %s dias; limite calculado: %s dias',f.days_since_last_order,f.inactive_after_days) end,
    'alto_valor',case when f.is_high_value then format('Valor acumulado está no percentil 80 da base com histórico; corte atual: R$ %s',round(f.p80_lifetime,2)) end,
    'comprador_cesta',case when f.is_basket_buyer then format('%s pedido(s) válido(s) com cesta',f.basket_orders) end,
    'produtos_avulsos',case when f.is_product_only_buyer then 'Possui pedidos válidos, mas nenhum com cesta' end,
    'cesta_favorita',case when f.has_favorite_basket then format('Cesta favorita apareceu em %s compra(s)',f.favorite_basket_purchase_count) end,
    'proximo_recompra',case when f.is_near_repurchase then format('Está no intervalo de %s a %s dias da recompra típica',f.due_from_days,f.due_until_days) end
  )) as reasons
from flags f;

create or replace function public.get_customer_commercial_segments_v1(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select coalesce(
  (
    select to_jsonb(s)
    from public.customer_commercial_segments_v1 s
    where s.customer_id=p_customer_id
  ),
  jsonb_build_object(
    'customer_id',p_customer_id,
    'order_count',0,
    'segments','[]'::jsonb,
    'reasons','{}'::jsonb
  )
)
$$;

revoke all on function public.get_customer_commercial_segments_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_commercial_segments_v1(uuid) to service_role;

comment on view public.customer_commercial_segments_v1 is
  'Segmentos comerciais calculados exclusivamente a partir de pedidos válidos e regras explicáveis.';
comment on function public.get_customer_commercial_segments_v1(uuid) is
  'Retorna segmentos comerciais objetivos e suas justificativas para um cliente.';

commit;
