begin;

-- Dona Antônia · Marketing Strategy attribution + learning v1
-- Tracking opaco por dispatch/oferta, atribuição direta/assistida em 7 dias
-- e aprendizado agregado. Não ativa runtime, worker, ANA ou Meta.

create table if not exists public.marketing_tracking_links_v1 (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  dispatch_id uuid not null references public.marketing_campaign_dispatches_v1(id) on delete cascade,
  strategy_id uuid not null references public.marketing_strategy_runs_v1(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns_v1(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  offer_position integer not null check (offer_position between 1 and 10),
  commercial_id uuid,
  public_lot_id uuid,
  expires_at timestamptz not null default (now()+interval '7 days'),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  checkout_started_at timestamptz,
  attributed_order_id uuid references public.orders(id) on delete set null,
  attribution_kind text check (attribution_kind is null or attribution_kind in ('direct','assisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (dispatch_id,offer_position)
);

create index if not exists marketing_tracking_links_v1_strategy_idx
  on public.marketing_tracking_links_v1(strategy_id,created_at desc);
create index if not exists marketing_tracking_links_v1_campaign_idx
  on public.marketing_tracking_links_v1(campaign_id,created_at desc);
create index if not exists marketing_tracking_links_v1_customer_idx
  on public.marketing_tracking_links_v1(customer_id,first_opened_at desc)
  where first_opened_at is not null;
create index if not exists marketing_tracking_links_v1_order_idx
  on public.marketing_tracking_links_v1(attributed_order_id)
  where attributed_order_id is not null;

alter table public.marketing_tracking_links_v1 enable row level security;
revoke all on table public.marketing_tracking_links_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_tracking_links_v1 to service_role;

create or replace function public.marketing_issue_tracking_links_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_offer record;
  v_raw text;
  v_hash text;
  v_link public.marketing_tracking_links_v1%rowtype;
  v_links jsonb:='[]'::jsonb;
begin
  select * into v_dispatch
  from public.marketing_campaign_dispatches_v1
  where id=p_dispatch_id;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;

  select * into v_campaign
  from public.marketing_campaigns_v1
  where id=v_dispatch.campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;

  -- Campanhas fora do motor de Estratégia continuam funcionando sem tracking novo.
  if v_campaign.strategy_id is null then
    return jsonb_build_object('ok',true,'strategy_tracked',false,'tracking_links','[]'::jsonb);
  end if;

  for v_offer in
    select o.position,o.commercial_id,o.public_lot_id,o.public_name
    from public.marketing_strategy_offers_v1 o
    where o.strategy_id=v_campaign.strategy_id
    order by o.position
  loop
    -- O token bruto existe somente nesta execução e na resposta para o worker.
    -- Persistimos somente SHA-256. Uma nova emissão pré-envio invalida a anterior;
    -- dispatch incerto não é reprocessado pelo worker, evitando link antigo ativo.
    v_raw:=encode(extensions.gen_random_bytes(18),'hex');
    v_hash:=encode(extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),'hex');

    insert into public.marketing_tracking_links_v1(
      token_hash,dispatch_id,strategy_id,campaign_id,customer_id,offer_position,
      commercial_id,public_lot_id,expires_at,metadata,updated_at
    ) values (
      v_hash,v_dispatch.id,v_campaign.strategy_id,v_campaign.id,v_dispatch.customer_id,v_offer.position,
      v_offer.commercial_id,v_offer.public_lot_id,now()+interval '7 days',
      jsonb_build_object('source','marketing_strategy_v1','public_name',v_offer.public_name),now()
    )
    on conflict (dispatch_id,offer_position) do update
      set token_hash=excluded.token_hash,
          commercial_id=excluded.commercial_id,
          public_lot_id=excluded.public_lot_id,
          expires_at=excluded.expires_at,
          first_opened_at=null,
          last_opened_at=null,
          open_count=0,
          checkout_started_at=null,
          attributed_order_id=null,
          attribution_kind=null,
          metadata=excluded.metadata,
          updated_at=now()
    returning * into v_link;

    v_links:=v_links||jsonb_build_array(jsonb_build_object(
      'card_index',v_offer.position-1,
      'offer_position',v_offer.position,
      'commercial_id',v_offer.commercial_id,
      'public_lot_id',v_offer.public_lot_id,
      'tracking_token',v_raw,
      'url','https://www.donaantonia.com.br/?mt='||v_raw
    ));
  end loop;

  if jsonb_array_length(v_links)=0 then
    return jsonb_build_object('ok',false,'error','strategy_offers_missing');
  end if;

  return jsonb_build_object(
    'ok',true,'strategy_tracked',true,'strategy_id',v_campaign.strategy_id,
    'campaign_id',v_campaign.id,'dispatch_id',v_dispatch.id,'tracking_links',v_links
  );
end;
$$;
revoke all on function public.marketing_issue_tracking_links_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_issue_tracking_links_v1(uuid) to service_role;

create or replace function public.marketing_resolve_tracking_token_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=lower(btrim(coalesce(p_token,'')));
  v_hash text;
  v_link public.marketing_tracking_links_v1%rowtype;
  v_open integer;
begin
  if v_token !~ '^[0-9a-f]{36}$' then return jsonb_build_object('ok',false,'error','tracking_token_invalid'); end if;
  v_hash:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  update public.marketing_tracking_links_v1
  set first_opened_at=coalesce(first_opened_at,now()),
      last_opened_at=now(),
      open_count=open_count+1,
      updated_at=now()
  where token_hash=v_hash and expires_at>=now()
  returning * into v_link;

  if not found then return jsonb_build_object('ok',false,'error','tracking_token_not_found'); end if;
  v_open:=v_link.open_count;

  insert into public.marketing_attribution_events_v1(
    strategy_id,campaign_id,customer_id,commercial_id,public_lot_id,event_type,
    token_hash,idempotency_key,occurred_at,metadata
  ) values (
    v_link.strategy_id,v_link.campaign_id,v_link.customer_id,v_link.commercial_id,v_link.public_lot_id,'click',
    v_hash,format('tracking-open:%s:%s',v_link.id,v_open),now(),
    jsonb_build_object('dispatch_id',v_link.dispatch_id,'offer_position',v_link.offer_position,'open_count',v_open)
  ) on conflict(idempotency_key) do nothing;

  -- Resposta pública deliberadamente sem customer_id/telefone/token_hash.
  return jsonb_build_object(
    'ok',true,'strategy_id',v_link.strategy_id,'campaign_id',v_link.campaign_id,
    'commercial_id',v_link.commercial_id,'public_lot_id',v_link.public_lot_id,
    'offer_position',v_link.offer_position,'expires_at',v_link.expires_at
  );
end;
$$;
revoke all on function public.marketing_resolve_tracking_token_v1(text) from public,anon,authenticated;
grant execute on function public.marketing_resolve_tracking_token_v1(text) to service_role;

create or replace function public.marketing_track_checkout_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_token text:=lower(btrim(coalesce(p_token,'')));
  v_hash text;
  v_link public.marketing_tracking_links_v1%rowtype;
begin
  if v_token !~ '^[0-9a-f]{36}$' then return jsonb_build_object('ok',false,'error','tracking_token_invalid'); end if;
  v_hash:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  update public.marketing_tracking_links_v1
  set checkout_started_at=coalesce(checkout_started_at,now()),updated_at=now()
  where token_hash=v_hash and expires_at>=now()
  returning * into v_link;
  if not found then return jsonb_build_object('ok',false,'error','tracking_token_not_found'); end if;

  insert into public.marketing_attribution_events_v1(
    strategy_id,campaign_id,customer_id,commercial_id,public_lot_id,event_type,
    token_hash,idempotency_key,occurred_at,metadata
  ) values (
    v_link.strategy_id,v_link.campaign_id,v_link.customer_id,v_link.commercial_id,v_link.public_lot_id,'checkout_started',
    v_hash,format('tracking-checkout:%s',v_link.id),coalesce(v_link.checkout_started_at,now()),
    jsonb_build_object('dispatch_id',v_link.dispatch_id,'offer_position',v_link.offer_position)
  ) on conflict(idempotency_key) do nothing;

  return jsonb_build_object('ok',true,'strategy_id',v_link.strategy_id,'campaign_id',v_link.campaign_id,'offer_position',v_link.offer_position);
end;
$$;
revoke all on function public.marketing_track_checkout_v1(text) from public,anon,authenticated;
grant execute on function public.marketing_track_checkout_v1(text) to service_role;

create or replace function public.marketing_attribute_order_v1(
  p_order_id uuid,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_token text:=lower(btrim(coalesce(p_token,'')));
  v_hash text;
  v_clicked public.marketing_tracking_links_v1%rowtype;
  v_assisted public.marketing_tracking_links_v1%rowtype;
  v_link public.marketing_tracking_links_v1%rowtype;
  v_kind text;
  v_order_commercial_id uuid;
  v_order_lot_id uuid;
  v_item_commercial_id uuid;
  v_item_lot_id uuid;
  v_direct_match boolean:=false;
  v_event_key text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if v_order.cancelled_at is not null or v_order.returned_at is not null then
    return jsonb_build_object('ok',false,'error','order_not_attributable');
  end if;

  v_order_commercial_id:=v_order.basket_id;

  select
    case when coalesce(i.metadata->>'basket_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (i.metadata->>'basket_id')::uuid else null end,
    case when coalesce(i.metadata->>'basket_lot_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (i.metadata->>'basket_lot_id')::uuid else null end
  into v_item_commercial_id,v_item_lot_id
  from public.order_items i
  where i.order_id=v_order.id
    and ((i.metadata ? 'basket_id') or (i.metadata ? 'basket_lot_id'))
  order by i.created_at,i.id
  limit 1;

  v_order_commercial_id:=coalesce(v_order_commercial_id,v_item_commercial_id);
  v_order_lot_id:=v_item_lot_id;

  if v_token ~ '^[0-9a-f]{36}$' then
    v_hash:=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');
    select * into v_clicked
    from public.marketing_tracking_links_v1
    where token_hash=v_hash
      and expires_at>=v_order.created_at
      and created_at<=v_order.created_at
      and customer_id is not distinct from v_order.customer_id
    limit 1;

    if found then
      v_direct_match:=(
        (v_clicked.commercial_id is not null and v_clicked.commercial_id=v_order_commercial_id)
        or (v_clicked.public_lot_id is not null and v_clicked.public_lot_id=v_order_lot_id)
      );
      if v_direct_match then
        v_link:=v_clicked;
        v_kind:='direct';
      end if;
    end if;
  end if;

  if v_kind is null and v_order.customer_id is not null then
    select l.* into v_assisted
    from public.marketing_tracking_links_v1 l
    where l.customer_id=v_order.customer_id
      and l.first_opened_at is not null
      and l.first_opened_at<=v_order.created_at
      and l.first_opened_at>=v_order.created_at-interval '7 days'
      and l.expires_at>=l.first_opened_at
    order by l.first_opened_at desc,l.created_at desc
    limit 1;
    if found then
      v_link:=v_assisted;
      v_kind:='assisted';
      v_hash:=v_assisted.token_hash;
    end if;
  end if;

  if v_kind is null then return jsonb_build_object('ok',true,'attributed',false,'reason','no_marketing_touch_in_window'); end if;

  v_event_key:=format('strategy-order:%s:%s',v_link.strategy_id,v_order.id);
  insert into public.marketing_attribution_events_v1(
    strategy_id,campaign_id,customer_id,order_id,commercial_id,public_lot_id,event_type,
    attribution_kind,amount,token_hash,idempotency_key,occurred_at,metadata
  ) values (
    v_link.strategy_id,v_link.campaign_id,v_order.customer_id,v_order.id,
    coalesce(v_order_commercial_id,v_link.commercial_id),coalesce(v_order_lot_id,v_link.public_lot_id),
    'order_attributed',v_kind,greatest(coalesce(v_order.total,0),0),v_hash,v_event_key,
    coalesce(v_order.confirmed_at,v_order.created_at,now()),
    jsonb_build_object(
      'dispatch_id',v_link.dispatch_id,'offer_position',v_link.offer_position,
      'clicked_commercial_id',v_link.commercial_id,'clicked_public_lot_id',v_link.public_lot_id,
      'purchased_commercial_id',v_order_commercial_id,'purchased_public_lot_id',v_order_lot_id,
      'direct_offer_match',v_direct_match
    )
  ) on conflict(idempotency_key) do nothing;

  update public.marketing_tracking_links_v1
  set attributed_order_id=coalesce(attributed_order_id,v_order.id),
      attribution_kind=coalesce(attribution_kind,v_kind),updated_at=now()
  where id=v_link.id;

  return jsonb_build_object(
    'ok',true,'attributed',true,'attribution_kind',v_kind,'strategy_id',v_link.strategy_id,
    'campaign_id',v_link.campaign_id,'order_id',v_order.id,'amount',v_order.total,
    'commercial_id',coalesce(v_order_commercial_id,v_link.commercial_id),
    'public_lot_id',coalesce(v_order_lot_id,v_link.public_lot_id)
  );
end;
$$;
revoke all on function public.marketing_attribute_order_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_attribute_order_v1(uuid,text) to service_role;

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
    count(*) filter(where attribution_kind='direct')::integer,
    count(*) filter(where attribution_kind='assisted')::integer,
    coalesce(sum(amount) filter(where attribution_kind='direct'),0),
    coalesce(sum(amount) filter(where attribution_kind='assisted'),0),
    coalesce(sum(amount),0)
  into v_orders,v_direct_orders,v_assisted_orders,v_direct_revenue,v_assisted_revenue,v_attributed_revenue
  from public.marketing_attribution_events_v1
  where event_type='order_attributed';

  v_level:=case when v_orders>=10 then 'confirmed' when v_orders>=3 then 'trend' else 'insufficient' end;

  select
    e.commercial_id,e.public_lot_id,
    coalesce(max(o.public_name),'Cesta ou Kit') as public_name,
    count(*)::integer as attributed_orders,
    coalesce(sum(e.amount),0) as attributed_revenue
  into v_top
  from public.marketing_attribution_events_v1 e
  left join public.marketing_strategy_offers_v1 o
    on o.strategy_id=e.strategy_id
   and (o.commercial_id=e.commercial_id or (e.public_lot_id is not null and o.public_lot_id=e.public_lot_id))
  where e.event_type='order_attributed'
  group by e.commercial_id,e.public_lot_id
  order by attributed_revenue desc,attributed_orders desc
  limit 1;

  if v_orders>0 then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Receita atribuída às estratégias',
      'summary',format('%s pedido(s) atribuídos: %s direto(s) e %s assistido(s). Receita atribuída de R$ %s.',v_orders,v_direct_orders,v_assisted_orders,to_char(v_attributed_revenue,'FM999999990D00')),
      'sample_label',format('%s estratégias concluídas · janela de 7 dias',v_completed),
      'direct_revenue',v_direct_revenue,'assisted_revenue',v_assisted_revenue,'attributed_revenue',v_attributed_revenue
    ));
  end if;

  if v_top.commercial_id is not null or v_top.public_lot_id is not null then
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'evidence_label',case v_level when 'confirmed' then 'Aprendizado confirmado' when 'trend' then 'Tendência' else 'Sinal inicial' end,
      'title','Cesta/Kit com melhor retorno atribuído',
      'summary',format('%s gerou %s pedido(s) atribuído(s) e R$ %s em receita.',v_top.public_name,v_top.attributed_orders,to_char(v_top.attributed_revenue,'FM999999990D00')),
      'sample_label','Comparação baseada em pedidos reais atribuídos',
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
      'attributed_revenue',v_attributed_revenue,'window_days',7
    ),
    'items',v_items
  );
end;
$$;
revoke all on function public.marketing_strategy_learnings_v1() from public,anon,authenticated;
grant execute on function public.marketing_strategy_learnings_v1() to service_role;

commit;
