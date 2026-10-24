begin;

-- Conversão de Marketing só nasce quando o pedido está confirmado e identificado.
-- Cancelamentos/devoluções deixam de compor a receita aprendida sem apagar auditoria histórica.

create or replace function public.marketing_attribute_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.customer_id is not null
     and new.confirmed_at is not null
     and new.cancelled_at is null
     and new.returned_at is null
     and (
       tg_op='INSERT'
       or old.customer_id is distinct from new.customer_id
       or old.confirmed_at is distinct from new.confirmed_at
     ) then
    perform public.marketing_attribute_order_v1(new.id,null);
  end if;
  return new;
exception when others then
  -- Marketing é observacional: nunca bloqueia o fluxo operacional do pedido.
  return new;
end;
$$;
revoke all on function public.marketing_attribute_order_trigger_v1() from public,anon,authenticated;
grant execute on function public.marketing_attribute_order_trigger_v1() to service_role;

create or replace function public.marketing_strategy_learnings_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_completed integer:=0;
  v_orders integer:=0;
  v_direct_orders integer:=0;
  v_assisted_orders integer:=0;
  v_direct_revenue numeric:=0;
  v_assisted_revenue numeric:=0;
  v_attributed_revenue numeric:=0;
  v_level text:='insufficient';
  v_items jsonb:='[]'::jsonb;
  v_top record;
begin
  select count(*)::integer into v_completed
  from public.marketing_strategy_runs_v1 where status='completed';

  select
    count(*)::integer,
    count(*) filter(where e.attribution_kind='direct')::integer,
    count(*) filter(where e.attribution_kind='assisted')::integer,
    coalesce(sum(e.amount) filter(where e.attribution_kind='direct'),0),
    coalesce(sum(e.amount) filter(where e.attribution_kind='assisted'),0),
    coalesce(sum(e.amount),0)
  into v_orders,v_direct_orders,v_assisted_orders,v_direct_revenue,v_assisted_revenue,v_attributed_revenue
  from public.marketing_attribution_events_v1 e
  join public.orders ord on ord.id=e.order_id
  where e.event_type='order_attributed'
    and ord.confirmed_at is not null
    and ord.cancelled_at is null
    and ord.returned_at is null;

  v_level:=case when v_orders>=10 then 'confirmed' when v_orders>=3 then 'trend' else 'insufficient' end;

  select
    e.commercial_id,e.public_lot_id,
    coalesce(max(o.public_name),'Cesta ou Kit') as public_name,
    count(*)::integer as attributed_orders,
    coalesce(sum(e.amount),0) as attributed_revenue
  into v_top
  from public.marketing_attribution_events_v1 e
  join public.orders ord on ord.id=e.order_id
  left join public.marketing_strategy_offers_v1 o
    on o.strategy_id=e.strategy_id
   and (o.commercial_id=e.commercial_id or (e.public_lot_id is not null and o.public_lot_id=e.public_lot_id))
  where e.event_type='order_attributed'
    and ord.confirmed_at is not null
    and ord.cancelled_at is null
    and ord.returned_at is null
  group by e.commercial_id,e.public_lot_id
  order by attributed_revenue desc,attributed_orders desc
  limit 1;

  if v_orders>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Receita atribuída às estratégias',
      'summary',format('%s pedido(s) confirmados atribuídos: %s direto(s) e %s assistido(s). Receita atribuída de R$ %s.',v_orders,v_direct_orders,v_assisted_orders,to_char(v_attributed_revenue,'FM999999990D00')),
      'sample_label',format('%s estratégias concluídas · janela de 7 dias',v_completed),
      'direct_revenue',v_direct_revenue,'assisted_revenue',v_assisted_revenue,'attributed_revenue',v_attributed_revenue
    ));
  end if;

  if v_top.commercial_id is not null or v_top.public_lot_id is not null then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Cesta/Kit com melhor retorno atribuído',
      'summary',format('%s gerou %s pedido(s) confirmado(s) atribuído(s) e R$ %s em receita.',v_top.public_name,v_top.attributed_orders,to_char(v_top.attributed_revenue,'FM999999990D00')),
      'sample_label','Comparação baseada em pedidos confirmados e não cancelados',
      'commercial_id',v_top.commercial_id,'public_lot_id',v_top.public_lot_id,
      'attributed_orders',v_top.attributed_orders,'attributed_revenue',v_top.attributed_revenue
    ));
  end if;

  return jsonb_build_object(
    'ok',true,'evidence_level',v_level,
    'sample',jsonb_build_object(
      'completed_strategies',v_completed,'attributed_orders',v_orders,
      'direct_orders',v_direct_orders,'assisted_orders',v_assisted_orders,
      'direct_revenue',v_direct_revenue,'assisted_revenue',v_assisted_revenue,
      'attributed_revenue',v_attributed_revenue,'window_days',7,
      'orders_scope','confirmed_non_cancelled_non_returned'
    ),
    'items',v_items
  );
end;
$$;
revoke all on function public.marketing_strategy_learnings_v1() from public,anon,authenticated;
grant execute on function public.marketing_strategy_learnings_v1() to service_role;

commit;
