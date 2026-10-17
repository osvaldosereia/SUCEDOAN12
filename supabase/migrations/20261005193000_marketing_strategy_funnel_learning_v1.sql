begin;

-- Dona Antônia · Funil comercial e aprendizado v1
-- Reúne fatos das fontes canônicas sem duplicar eventos de entrega/leitura.

create or replace function public.marketing_strategy_funnel_v1(
  p_strategy_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_selected integer:=0;
  v_sent integer:=0;
  v_delivered integer:=0;
  v_read integer:=0;
  v_clicked_recipients integer:=0;
  v_storefront_opens integer:=0;
  v_checkout_started integer:=0;
  v_responded_recipients integer:=0;
  v_response_messages integer:=0;
  v_attributed_orders integer:=0;
  v_direct_orders integer:=0;
  v_assisted_orders integer:=0;
  v_cancelled_orders integer:=0;
  v_direct_revenue numeric:=0;
  v_assisted_revenue numeric:=0;
  v_attributed_revenue numeric:=0;
  v_avg_ticket numeric:=0;
  v_avg_hours_to_order numeric:=null;
  v_delivery_rate numeric:=0;
  v_read_rate numeric:=0;
  v_click_rate numeric:=0;
  v_response_rate numeric:=0;
  v_conversion_rate numeric:=0;
  v_revenue_per_1000_delivered numeric:=0;
begin
  with campaign_scope as (
    select c.id,c.strategy_id,c.whatsapp_account_id
    from public.marketing_campaigns_v1 c
    where c.strategy_id is not null
      and (p_strategy_id is null or c.strategy_id=p_strategy_id)
  ),
  dispatch_base as (
    select
      d.id,d.campaign_id,d.customer_id,d.whatsapp_account_id,d.provider_message_id,d.status,d.created_at,d.updated_at,
      cs.strategy_id,
      coalesce(m.sent_at,d.updated_at,d.created_at) as sent_anchor,
      lower(coalesce(m.status_current,'')) as message_status
    from public.marketing_campaign_dispatches_v1 d
    join campaign_scope cs on cs.id=d.campaign_id
    left join lateral (
      select wm.sent_at,wm.status_current
      from public.whatsapp_messages_v1 wm
      where wm.provider='meta'
        and wm.provider_message_id=d.provider_message_id
      order by wm.created_at desc,wm.id desc
      limit 1
    ) m on true
  ),
  dispatch_flags as (
    select
      db.*,
      (
        db.message_status in ('sent','delivered','read')
        or exists (
          select 1 from public.whatsapp_message_status_events_v1 se
          where se.provider='meta' and se.provider_message_id=db.provider_message_id
            and lower(se.status) in ('sent','delivered','read')
        )
      ) as sent_flag,
      (
        db.message_status in ('delivered','read')
        or exists (
          select 1 from public.whatsapp_message_status_events_v1 se
          where se.provider='meta' and se.provider_message_id=db.provider_message_id
            and lower(se.status) in ('delivered','read')
        )
      ) as delivered_flag,
      (
        db.message_status='read'
        or exists (
          select 1 from public.whatsapp_message_status_events_v1 se
          where se.provider='meta' and se.provider_message_id=db.provider_message_id
            and lower(se.status)='read'
        )
      ) as read_flag
    from dispatch_base db
  )
  select
    count(*)::integer,
    count(*) filter(where sent_flag)::integer,
    count(*) filter(where delivered_flag)::integer,
    count(*) filter(where read_flag)::integer
  into v_selected,v_sent,v_delivered,v_read
  from dispatch_flags;

  with scoped_links as (
    select l.*
    from public.marketing_tracking_links_v1 l
    where p_strategy_id is null or l.strategy_id=p_strategy_id
  )
  select
    count(distinct dispatch_id) filter(where first_opened_at is not null)::integer,
    coalesce(sum(open_count),0)::integer,
    count(distinct dispatch_id) filter(where checkout_started_at is not null)::integer
  into v_clicked_recipients,v_storefront_opens,v_checkout_started
  from scoped_links;

  -- Uma mensagem inbound é relacionada à campanha de Estratégia mais recente
  -- do mesmo cliente/canal nos 7 dias anteriores. Isso mede interação pós-campanha
  -- sem duplicar a mensagem na tabela de atribuição.
  with inbound_messages as (
    select
      wm.id,
      wm.customer_id,
      wm.whatsapp_account_id,
      coalesce(wm.received_at,wm.created_at) as inbound_at
    from public.whatsapp_messages_v1 wm
    where wm.direction='inbound'
      and wm.customer_id is not null
  ),
  attributed_inbound as (
    select i.id,i.customer_id,hit.dispatch_id,hit.strategy_id
    from inbound_messages i
    cross join lateral (
      select
        d.id as dispatch_id,
        c.strategy_id,
        coalesce(out_msg.sent_at,d.updated_at,d.created_at) as sent_anchor
      from public.marketing_campaign_dispatches_v1 d
      join public.marketing_campaigns_v1 c on c.id=d.campaign_id and c.strategy_id is not null
      left join lateral (
        select wm.sent_at
        from public.whatsapp_messages_v1 wm
        where wm.provider='meta' and wm.provider_message_id=d.provider_message_id
        order by wm.created_at desc,wm.id desc
        limit 1
      ) out_msg on true
      where d.customer_id=i.customer_id
        and d.whatsapp_account_id=i.whatsapp_account_id
        and d.provider_message_id is not null
        and coalesce(out_msg.sent_at,d.updated_at,d.created_at)<=i.inbound_at
        and coalesce(out_msg.sent_at,d.updated_at,d.created_at)>=i.inbound_at-interval '7 days'
      order by coalesce(out_msg.sent_at,d.updated_at,d.created_at) desc,d.id desc
      limit 1
    ) hit
    where p_strategy_id is null or hit.strategy_id=p_strategy_id
  )
  select
    count(distinct dispatch_id)::integer,
    count(*)::integer
  into v_responded_recipients,v_response_messages
  from attributed_inbound;

  select
    count(distinct e.order_id)::integer,
    count(distinct e.order_id) filter(where e.attribution_kind='direct')::integer,
    count(distinct e.order_id) filter(where e.attribution_kind='assisted')::integer,
    coalesce(sum(e.amount) filter(where e.attribution_kind='direct'),0),
    coalesce(sum(e.amount) filter(where e.attribution_kind='assisted'),0),
    coalesce(sum(e.amount),0),
    coalesce(avg(e.amount),0)
  into v_attributed_orders,v_direct_orders,v_assisted_orders,v_direct_revenue,v_assisted_revenue,v_attributed_revenue,v_avg_ticket
  from public.marketing_attribution_events_v1 e
  join public.orders o on o.id=e.order_id
  where e.event_type='order_attributed'
    and (p_strategy_id is null or e.strategy_id=p_strategy_id)
    and o.confirmed_at is not null
    and o.cancelled_at is null
    and o.returned_at is null;

  select count(distinct e.order_id)::integer
  into v_cancelled_orders
  from public.marketing_attribution_events_v1 e
  join public.orders o on o.id=e.order_id
  where e.event_type='order_attributed'
    and (p_strategy_id is null or e.strategy_id=p_strategy_id)
    and (o.cancelled_at is not null or o.returned_at is not null);

  select round(avg(extract(epoch from (o.confirmed_at-l.first_opened_at))/3600.0)::numeric,2)
  into v_avg_hours_to_order
  from public.marketing_tracking_links_v1 l
  join public.orders o on o.id=l.attributed_order_id
  where l.first_opened_at is not null
    and o.confirmed_at is not null
    and o.cancelled_at is null
    and o.returned_at is null
    and (p_strategy_id is null or l.strategy_id=p_strategy_id);

  v_delivery_rate:=case when v_sent>0 then round((v_delivered::numeric/v_sent)*100,2) else 0 end;
  v_read_rate:=case when v_delivered>0 then round((v_read::numeric/v_delivered)*100,2) else 0 end;
  v_click_rate:=case when v_delivered>0 then round((v_clicked_recipients::numeric/v_delivered)*100,2) else 0 end;
  v_response_rate:=case when v_delivered>0 then round((v_responded_recipients::numeric/v_delivered)*100,2) else 0 end;
  v_conversion_rate:=case when v_delivered>0 then round((v_attributed_orders::numeric/v_delivered)*100,2) else 0 end;
  v_revenue_per_1000_delivered:=case when v_delivered>0 then round((v_attributed_revenue/v_delivered)*1000,2) else 0 end;

  return jsonb_build_object(
    'ok',true,
    'strategy_id',p_strategy_id,
    'window_days',7,
    'selected',v_selected,
    'sent',v_sent,
    'delivered',v_delivered,
    'read',v_read,
    'delivery_rate',v_delivery_rate,
    'read_rate',v_read_rate,
    'clicked_recipients',v_clicked_recipients,
    'storefront_opens',v_storefront_opens,
    'click_rate',v_click_rate,
    'checkout_started',v_checkout_started,
    'responded_recipients',v_responded_recipients,
    'response_messages',v_response_messages,
    'response_rate',v_response_rate,
    'attributed_orders',v_attributed_orders,
    'direct_orders',v_direct_orders,
    'assisted_orders',v_assisted_orders,
    'cancelled_orders',v_cancelled_orders,
    'direct_revenue',round(v_direct_revenue,2),
    'assisted_revenue',round(v_assisted_revenue,2),
    'attributed_revenue',round(v_attributed_revenue,2),
    'avg_ticket',round(v_avg_ticket,2),
    'conversion_rate',v_conversion_rate,
    'revenue_per_1000_delivered',v_revenue_per_1000_delivered,
    'avg_hours_to_order',v_avg_hours_to_order
  );
end;
$$;
revoke all on function public.marketing_strategy_funnel_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_strategy_funnel_v1(uuid) to service_role;

create or replace function public.marketing_strategy_offer_performance_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_items jsonb:='[]'::jsonb;
begin
  with strategy_campaigns as (
    select c.id as campaign_id,c.strategy_id
    from public.marketing_campaigns_v1 c
    where c.strategy_id is not null
  ),
  dispatch_flags as (
    select
      d.id,d.campaign_id,sc.strategy_id,
      (
        lower(coalesce(m.status_current,'')) in ('delivered','read')
        or exists (
          select 1 from public.whatsapp_message_status_events_v1 se
          where se.provider='meta' and se.provider_message_id=d.provider_message_id
            and lower(se.status) in ('delivered','read')
        )
      ) as delivered_flag
    from public.marketing_campaign_dispatches_v1 d
    join strategy_campaigns sc on sc.campaign_id=d.campaign_id
    left join lateral (
      select wm.status_current
      from public.whatsapp_messages_v1 wm
      where wm.provider='meta' and wm.provider_message_id=d.provider_message_id
      order by wm.created_at desc,wm.id desc
      limit 1
    ) m on true
  ),
  delivered_by_strategy as (
    select strategy_id,count(*) filter(where delivered_flag)::integer as delivered
    from dispatch_flags
    group by strategy_id
  ),
  exposure as (
    select
      o.commercial_id,
      max(o.public_name) as public_name,
      sum(coalesce(d.delivered,0))::integer as delivered
    from public.marketing_strategy_offers_v1 o
    left join delivered_by_strategy d on d.strategy_id=o.strategy_id
    group by o.commercial_id
  ),
  sales as (
    select
      e.commercial_id,
      count(distinct e.order_id)::integer as orders,
      coalesce(sum(e.amount),0) as revenue
    from public.marketing_attribution_events_v1 e
    join public.orders ord on ord.id=e.order_id
    where e.event_type='order_attributed'
      and e.attribution_kind='direct'
      and e.commercial_id is not null
      and ord.confirmed_at is not null
      and ord.cancelled_at is null
      and ord.returned_at is null
    group by e.commercial_id
  ),
  metrics as (
    select
      x.commercial_id,x.public_name,x.delivered,
      coalesce(s.orders,0) as orders,
      coalesce(s.revenue,0) as revenue,
      case when x.delivered>0 then round((coalesce(s.orders,0)::numeric/x.delivered)*1000,2) else 0 end as orders_per_1000_delivered,
      case when x.delivered>0 then round((coalesce(s.revenue,0)/x.delivered)*1000,2) else 0 end as revenue_per_1000_delivered
    from exposure x
    left join sales s on s.commercial_id=x.commercial_id
  ),
  normalized as (
    select
      m.*,
      max(m.revenue_per_1000_delivered) over() as max_revenue_per_1000
    from metrics m
  ),
  scored as (
    select
      n.*,
      round((
        least(1,n.delivered::numeric/100)
        * case when n.max_revenue_per_1000>0 then least(1,n.revenue_per_1000_delivered/n.max_revenue_per_1000) else 0 end
      ),4) as score_signal,
      case
        when n.delivered>=100 and n.orders>=10 then 'confirmed'
        when n.delivered>=30 or n.orders>=3 then 'trend'
        else 'insufficient'
      end as evidence_level
    from normalized n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'commercial_id',commercial_id,
    'public_name',public_name,
    'delivered',delivered,
    'orders',orders,
    'revenue',round(revenue,2),
    'orders_per_1000_delivered',orders_per_1000_delivered,
    'revenue_per_1000_delivered',revenue_per_1000_delivered,
    'score_signal',score_signal,
    'evidence_level',evidence_level
  ) order by score_signal desc,revenue_per_1000_delivered desc,commercial_id),'[]'::jsonb)
  into v_items
  from scored;

  return jsonb_build_object('ok',true,'items',v_items,'scoring','revenue_per_1000_delivered_normalized_x_evidence','minimum_evidence_delivered',100);
end;
$$;
revoke all on function public.marketing_strategy_offer_performance_v1() from public,anon,authenticated;
grant execute on function public.marketing_strategy_offer_performance_v1() to service_role;

create or replace function public.marketing_strategy_learnings_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_funnel jsonb:=public.marketing_strategy_funnel_v1(null);
  v_performance jsonb:=public.marketing_strategy_offer_performance_v1();
  v_completed integer:=0;
  v_delivered integer:=coalesce((v_funnel->>'delivered')::integer,0);
  v_orders integer:=coalesce((v_funnel->>'attributed_orders')::integer,0);
  v_revenue numeric:=coalesce((v_funnel->>'attributed_revenue')::numeric,0);
  v_level text:='insufficient';
  v_items jsonb:='[]'::jsonb;
  v_top jsonb;
begin
  select count(*)::integer into v_completed
  from public.marketing_strategy_runs_v1 where status='completed';

  v_level:=case
    when v_delivered>=100 and v_orders>=10 then 'confirmed'
    when v_delivered>=30 or v_orders>=3 then 'trend'
    else 'insufficient'
  end;

  if coalesce((v_funnel->>'selected')::integer,0)>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Funil das estratégias',
      'summary',format('%s entregues · %s lidos · %s acessos · %s respostas · %s pedidos confirmados.',
        coalesce(v_funnel->>'delivered','0'),
        coalesce(v_funnel->>'read','0'),
        coalesce(v_funnel->>'clicked_recipients','0'),
        coalesce(v_funnel->>'responded_recipients','0'),
        coalesce(v_funnel->>'attributed_orders','0')
      ),
      'sample_label',format('%s estratégias concluídas · janela de 7 dias',v_completed),
      'metrics',v_funnel
    ));
  end if;

  if v_orders>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Resultado econômico',
      'summary',format('R$ %s atribuídos · R$ %s por 1.000 entregues · conversão de %s%%.',
        to_char(v_revenue,'FM999999990D00'),
        coalesce(v_funnel->>'revenue_per_1000_delivered','0'),
        coalesce(v_funnel->>'conversion_rate','0')
      ),
      'sample_label',format('%s pedidos diretos · %s assistidos · ticket médio R$ %s',
        coalesce(v_funnel->>'direct_orders','0'),
        coalesce(v_funnel->>'assisted_orders','0'),
        coalesce(v_funnel->>'avg_ticket','0')
      ),
      'direct_revenue',coalesce((v_funnel->>'direct_revenue')::numeric,0),
      'assisted_revenue',coalesce((v_funnel->>'assisted_revenue')::numeric,0),
      'attributed_revenue',v_revenue,
      'revenue_per_1000_delivered',coalesce((v_funnel->>'revenue_per_1000_delivered')::numeric,0)
    ));
  end if;

  v_top:=case
    when jsonb_typeof(v_performance->'items')='array' and jsonb_array_length(v_performance->'items')>0
      then (v_performance->'items')->0
    else null
  end;

  if v_top is not null and coalesce((v_top->>'orders')::integer,0)>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case coalesce(v_top->>'evidence_level','insufficient') when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Cesta/Kit com melhor retorno direto',
      'summary',format('%s gerou %s pedido(s) direto(s) e R$ %s por 1.000 entregues.',
        coalesce(v_top->>'public_name','Cesta ou Kit'),
        coalesce(v_top->>'orders','0'),
        coalesce(v_top->>'revenue_per_1000_delivered','0')
      ),
      'sample_label',format('%s mensagens entregues para estratégias com essa oferta',coalesce(v_top->>'delivered','0')),
      'commercial_id',v_top->>'commercial_id',
      'score_signal',coalesce((v_top->>'score_signal')::numeric,0)
    ));
  end if;

  return jsonb_build_object(
    'ok',true,
    'evidence_level',v_level,
    'sample',jsonb_build_object(
      'completed_strategies',v_completed,
      'delivered',v_delivered,
      'attributed_orders',v_orders,
      'window_days',7
    ),
    'funnel',v_funnel,
    'offer_performance',v_performance,
    'items',v_items
  );
end;
$$;
revoke all on function public.marketing_strategy_learnings_v1() from public,anon,authenticated;
grant execute on function public.marketing_strategy_learnings_v1() to service_role;

commit;
