begin;

-- Etapa 9 — segmentação comercial derivada.
-- Segmentos objetivos e explicáveis, calculados somente a partir de histórico real.

create or replace view public.customer_commercial_segments_v1
with (security_invoker=true)
as
with thresholds as (
  select
    coalesce(
      percentile_cont(0.80) within group(order by lifetime_value)
      filter(where order_count>0),
      0
    )::numeric(14,2) as high_value_p80
  from public.customer_purchase_intelligence_v1
),
base as (
  select
    i.*,
    t.high_value_p80,
    case
      when i.last_order_at is null then null
      else greatest(
        60,
        ceil(coalesce(i.average_repurchase_interval_days,60)*1.75)
      )::int
    end as inactivity_limit_days,
    case
      when i.estimated_next_repurchase_at is null then null
      else (i.estimated_next_repurchase_at::date-current_date)::int
    end as days_to_estimated_repurchase
  from public.customer_purchase_intelligence_v1 i
  cross join thresholds t
)
select
  b.customer_id,
  b.order_count,
  b.lifetime_value,
  b.average_ticket,
  b.last_order_at,
  b.days_since_last_order,
  b.average_repurchase_interval_days,
  b.repurchase_frequency_label,
  b.estimated_next_repurchase_at,
  b.history_confidence,
  b.favorite_basket_id,
  b.favorite_basket_name,
  b.favorite_basket_purchase_count,
  b.high_value_p80,
  b.inactivity_limit_days,
  b.days_to_estimated_repurchase,

  (b.order_count=1) as is_first_buyer,
  (b.order_count>=2) as is_recurring,
  (
    b.order_count>=3
    and b.average_repurchase_interval_days between 20 and 45
  ) as is_monthly,
  (
    b.order_count>0
    and b.last_order_at is not null
    and b.days_since_last_order>=b.inactivity_limit_days
  ) as is_inactive,
  (
    b.order_count>=2
    and b.high_value_p80>0
    and b.lifetime_value>=b.high_value_p80
  ) as is_high_value,
  (
    b.favorite_basket_id is not null
    or b.favorite_basket_name is not null
  ) as is_basket_buyer,
  (
    b.favorite_basket_purchase_count>=2
  ) as has_favorite_basket,
  (
    b.history_confidence in ('medium','high')
    and b.days_to_estimated_repurchase between 0 and 7
  ) as is_repurchase_due,
  (
    b.history_confidence in ('medium','high')
    and b.days_to_estimated_repurchase<0
  ) as is_repurchase_overdue,

  (
    select coalesce(jsonb_agg(segment order by priority,code),'[]'::jsonb)
    from (
      select 10 priority,'first_buyer' code,'Primeira compra' label,
             jsonb_build_object('order_count',b.order_count) details
      where b.order_count=1

      union all
      select 20,'recurring','Cliente recorrente',
             jsonb_build_object('order_count',b.order_count)
      where b.order_count>=2

      union all
      select 30,'monthly','Ritmo mensal',
             jsonb_build_object('average_interval_days',b.average_repurchase_interval_days)
      where b.order_count>=3
        and b.average_repurchase_interval_days between 20 and 45

      union all
      select 40,'high_value','Alto valor',
             jsonb_build_object('lifetime_value',b.lifetime_value,'threshold',b.high_value_p80)
      where b.order_count>=2
        and b.high_value_p80>0
        and b.lifetime_value>=b.high_value_p80

      union all
      select 50,'basket_buyer','Compra cestas',
             jsonb_build_object('favorite_basket',b.favorite_basket_name)
      where b.favorite_basket_id is not null
         or b.favorite_basket_name is not null

      union all
      select 60,'favorite_basket','Cesta favorita',
             jsonb_build_object('favorite_basket',b.favorite_basket_name,'purchase_count',b.favorite_basket_purchase_count)
      where b.favorite_basket_purchase_count>=2

      union all
      select 70,'repurchase_due','Próximo da recompra',
             jsonb_build_object('days_to_estimated_repurchase',b.days_to_estimated_repurchase)
      where b.history_confidence in ('medium','high')
        and b.days_to_estimated_repurchase between 0 and 7

      union all
      select 80,'repurchase_overdue','Recompra atrasada',
             jsonb_build_object('days_overdue',abs(b.days_to_estimated_repurchase))
      where b.history_confidence in ('medium','high')
        and b.days_to_estimated_repurchase<0

      union all
      select 90,'inactive','Inativo',
             jsonb_build_object('days_since_last_order',b.days_since_last_order,'limit_days',b.inactivity_limit_days)
      where b.order_count>0
        and b.last_order_at is not null
        and b.days_since_last_order>=b.inactivity_limit_days
    ) s(segment_priority,segment_code,segment_label,segment_details),
    lateral (
      select jsonb_build_object(
        'code',segment_code,
        'label',segment_label,
        'details',segment_details
      ) as segment,
      segment_priority as priority,
      segment_code as code
    ) j
  ) as segments

from base b;

create or replace function public.get_customer_commercial_segments_v1(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select jsonb_build_object(
      'customer_id',customer_id,
      'order_count',order_count,
      'lifetime_value',lifetime_value,
      'average_ticket',average_ticket,
      'last_order_at',last_order_at,
      'days_since_last_order',days_since_last_order,
      'average_repurchase_interval_days',average_repurchase_interval_days,
      'repurchase_frequency_label',repurchase_frequency_label,
      'estimated_next_repurchase_at',estimated_next_repurchase_at,
      'history_confidence',history_confidence,
      'high_value_threshold',high_value_p80,
      'inactivity_limit_days',inactivity_limit_days,
      'days_to_estimated_repurchase',days_to_estimated_repurchase,
      'flags',jsonb_build_object(
        'first_buyer',is_first_buyer,
        'recurring',is_recurring,
        'monthly',is_monthly,
        'inactive',is_inactive,
        'high_value',is_high_value,
        'basket_buyer',is_basket_buyer,
        'favorite_basket',has_favorite_basket,
        'repurchase_due',is_repurchase_due,
        'repurchase_overdue',is_repurchase_overdue
      ),
      'segments',segments
    )
    from public.customer_commercial_segments_v1
    where customer_id=p_customer_id
  ),'{}'::jsonb)
$$;

revoke all on public.customer_commercial_segments_v1 from public,anon,authenticated;
revoke all on function public.get_customer_commercial_segments_v1(uuid) from public,anon,authenticated;
grant select on public.customer_commercial_segments_v1 to service_role;
grant execute on function public.get_customer_commercial_segments_v1(uuid) to service_role;

comment on view public.customer_commercial_segments_v1 is
  'Segmentos comerciais explicáveis derivados do histórico real do cliente.';
comment on function public.get_customer_commercial_segments_v1(uuid) is
  'Retorna flags e segmentos comerciais objetivos para Admin/Comprar.';

commit;
