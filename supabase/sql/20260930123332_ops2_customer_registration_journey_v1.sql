-- Dona Antonia Operations 2.0
-- PapoAI Phase 1.5: deterministic customer-registration journey state.
-- No outbound PapoAI send is implemented in this migration.

create table if not exists public.ops2_customer_registration_journeys_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  registration_state text not null check (registration_state in ('pending','complete')),
  missing_fields text[] not null default '{}'::text[],
  workflow_open boolean not null default false,
  transition_seq integer not null default 1 check (transition_seq > 0),
  first_evaluated_at timestamptz not null default now(),
  first_pending_at timestamptz,
  completed_at timestamptz,
  last_transition_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  order_status_snapshot text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ops2_customer_registration_journeys_state_idx
  on public.ops2_customer_registration_journeys_v1(registration_state,workflow_open,last_evaluated_at desc);

create index if not exists ops2_customer_registration_journeys_customer_idx
  on public.ops2_customer_registration_journeys_v1(customer_id,last_evaluated_at desc)
  where customer_id is not null;

alter table public.ops2_customer_registration_journeys_v1 enable row level security;

drop policy if exists ops2_customer_registration_journeys_service_only_v1
  on public.ops2_customer_registration_journeys_v1;
create policy ops2_customer_registration_journeys_service_only_v1
  on public.ops2_customer_registration_journeys_v1
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.ops2_customer_registration_journeys_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_customer_registration_journeys_v1 to service_role;

create or replace function public.ops2_refresh_order_registration_journey_v1(
  p_order_id uuid,
  p_emit_event boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_state jsonb;
  v_new_state text;
  v_old_state text;
  v_missing text[] := '{}'::text[];
  v_workflow_open boolean := false;
  v_seq integer := 1;
  v_event_type text;
  v_existing public.ops2_customer_registration_journeys_v1%rowtype;
  v_event_id uuid;
begin
  select o.* into v_order
  from public.orders o
  where o.id=p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found','order_id',p_order_id);
  end if;

  if v_order.source not in ('vitrine','storefront_v2') then
    delete from public.ops2_customer_registration_journeys_v1 j where j.order_id=p_order_id;
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_site_order','order_id',p_order_id);
  end if;

  if v_order.customer_id is null then
    delete from public.ops2_customer_registration_journeys_v1 j where j.order_id=p_order_id;
    return jsonb_build_object('ok',false,'error','customer_missing','order_id',p_order_id);
  end if;

  v_state:=public.ops2_customer_registration_state_v1(v_order.customer_id);
  if coalesce((v_state->>'ok')::boolean,false)=false then
    return jsonb_build_object('ok',false,'error',coalesce(v_state->>'error','registration_state_failed'),'order_id',p_order_id);
  end if;

  v_new_state:=case when coalesce((v_state->>'registration_complete')::boolean,false) then 'complete' else 'pending' end;

  select coalesce(array_agg(x.value order by x.ord),'{}'::text[])
    into v_missing
  from jsonb_array_elements_text(coalesce(v_state->'missing_fields','[]'::jsonb)) with ordinality as x(value,ord);

  v_workflow_open:=v_new_state='pending'
    and v_order.status not in ('delivered','cancelled','returned');

  select j.* into v_existing
  from public.ops2_customer_registration_journeys_v1 j
  where j.order_id=p_order_id
  for update;

  if not found then
    v_seq:=1;
    insert into public.ops2_customer_registration_journeys_v1(
      order_id,customer_id,registration_state,missing_fields,workflow_open,transition_seq,
      first_evaluated_at,first_pending_at,completed_at,last_transition_at,last_evaluated_at,
      order_status_snapshot,metadata
    ) values (
      p_order_id,v_order.customer_id,v_new_state,v_missing,v_workflow_open,v_seq,
      now(),case when v_new_state='pending' then now() end,
      case when v_new_state='complete' then now() end,
      now(),now(),v_order.status,
      jsonb_build_object('source','derived','initial_state',true)
    );

    if p_emit_event then
      v_event_type:=case when v_new_state='pending' then 'customer.registration_required' else 'customer.registration_completed' end;
    end if;
  else
    v_old_state:=v_existing.registration_state;
    v_seq:=v_existing.transition_seq;

    if v_old_state is distinct from v_new_state then
      v_seq:=v_seq+1;
      update public.ops2_customer_registration_journeys_v1
      set customer_id=v_order.customer_id,
          registration_state=v_new_state,
          missing_fields=v_missing,
          workflow_open=v_workflow_open,
          transition_seq=v_seq,
          first_pending_at=case
            when v_new_state='pending' then coalesce(first_pending_at,now())
            else first_pending_at
          end,
          completed_at=case when v_new_state='complete' then now() else null end,
          last_transition_at=now(),
          last_evaluated_at=now(),
          order_status_snapshot=v_order.status,
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','derived','initial_state',false)
      where order_id=p_order_id;

      if p_emit_event then
        v_event_type:=case
          when v_new_state='complete' then 'customer.registration_completed'
          else 'customer.registration_reopened'
        end;
      end if;
    else
      update public.ops2_customer_registration_journeys_v1
      set customer_id=v_order.customer_id,
          missing_fields=v_missing,
          workflow_open=v_workflow_open,
          last_evaluated_at=now(),
          order_status_snapshot=v_order.status
      where order_id=p_order_id;
    end if;
  end if;

  if p_emit_event and v_event_type is not null then
    insert into public.ops_events(
      domain,event_type,entity_type,entity_id,correlation_id,
      actor_type,source_system,severity,summary,payload,idempotency_key
    ) values (
      'customer',v_event_type,'order',p_order_id::text,p_order_id::text,
      'system','dona_antonia','info',
      case v_event_type
        when 'customer.registration_required' then 'Customer registration required for site order'
        when 'customer.registration_completed' then 'Customer registration completed for site order'
        else 'Customer registration reopened for site order'
      end,
      jsonb_build_object(
        'order_id',p_order_id,
        'customer_id',v_order.customer_id,
        'registration_state',v_new_state,
        'missing_fields',to_jsonb(v_missing),
        'workflow_open',v_workflow_open,
        'transition_seq',v_seq
      ),
      format('customer_registration:%s:%s:%s',p_order_id,v_new_state,v_seq)
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'customer_id',v_order.customer_id,
    'registration_state',v_new_state,
    'missing_fields',to_jsonb(v_missing),
    'workflow_open',v_workflow_open,
    'transition_seq',v_seq,
    'event_type',v_event_type,
    'event_created',v_event_id is not null
  );
end;
$$;

revoke all on function public.ops2_refresh_order_registration_journey_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ops2_refresh_order_registration_journey_v1(uuid,boolean) to service_role;

create or replace function public.ops2_refresh_customer_registration_journeys_v1(
  p_customer_id uuid,
  p_emit_event boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order_id uuid;
  v_count integer:=0;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_id_required','refreshed_orders',0);
  end if;

  for v_order_id in
    select o.id
    from public.orders o
    where o.customer_id=p_customer_id
      and o.source in ('vitrine','storefront_v2')
  loop
    perform public.ops2_refresh_order_registration_journey_v1(v_order_id,p_emit_event);
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'customer_id',p_customer_id,'refreshed_orders',v_count);
end;
$$;

revoke all on function public.ops2_refresh_customer_registration_journeys_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ops2_refresh_customer_registration_journeys_v1(uuid,boolean) to service_role;

create or replace function public.ops2_order_registration_journey_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ops2_refresh_order_registration_journey_v1(new.id,true);
  return new;
end;
$$;

revoke all on function public.ops2_order_registration_journey_trigger_v1() from public,anon,authenticated;

create or replace function public.ops2_customer_registration_journey_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.ops2_refresh_customer_registration_journeys_v1(new.id,true);
  return new;
end;
$$;

revoke all on function public.ops2_customer_registration_journey_trigger_v1() from public,anon,authenticated;

create or replace function public.ops2_customer_address_registration_journey_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op='DELETE' then
    perform public.ops2_refresh_customer_registration_journeys_v1(old.customer_id,true);
    return old;
  end if;

  if tg_op='UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.ops2_refresh_customer_registration_journeys_v1(old.customer_id,true);
  end if;

  perform public.ops2_refresh_customer_registration_journeys_v1(new.customer_id,true);
  return new;
end;
$$;

revoke all on function public.ops2_customer_address_registration_journey_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_ops2_order_registration_journey_v1 on public.orders;
create trigger trg_ops2_order_registration_journey_v1
after insert or update of customer_id,status,source on public.orders
for each row
execute function public.ops2_order_registration_journey_trigger_v1();

drop trigger if exists trg_ops2_customer_registration_journey_v1 on public.customers;
create trigger trg_ops2_customer_registration_journey_v1
after update of name,cpf_cnpj,primary_whatsapp_e164 on public.customers
for each row
execute function public.ops2_customer_registration_journey_trigger_v1();

drop trigger if exists trg_ops2_customer_address_registration_journey_v1 on public.customer_addresses;
create trigger trg_ops2_customer_address_registration_journey_v1
after insert or delete or update of customer_id,street,city,is_active on public.customer_addresses
for each row
execute function public.ops2_customer_address_registration_journey_trigger_v1();

-- Silent baseline: establish derived state for recent customer-linked site orders
-- without manufacturing historical transition events.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select o.id
    from public.orders o
    where o.source in ('vitrine','storefront_v2')
      and o.customer_id is not null
      and o.created_at>=now()-interval '31 days'
  loop
    perform public.ops2_refresh_order_registration_journey_v1(v_order_id,false);
  end loop;
end;
$$;

create or replace function public.ops2_customer_registration_summary_v1(p_days integer default 31)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_days integer:=greatest(1,least(365,coalesce(p_days,31)));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(365,coalesce(p_days,31))));
  v_result jsonb;
begin
  with recent_orders as (
    select o.id,o.customer_id
    from public.orders o
    where o.created_at>=v_since
      and o.source in ('vitrine','storefront_v2')
  ), distinct_customers as (
    select distinct ro.customer_id
    from recent_orders ro
    where ro.customer_id is not null
  ), customer_states as (
    select dc.customer_id,public.ops2_customer_registration_state_v1(dc.customer_id) as state
    from distinct_customers dc
  ), order_states as (
    select ro.id,ro.customer_id,cs.state
    from recent_orders ro
    left join customer_states cs on cs.customer_id=ro.customer_id
  ), journey_states as (
    select j.*
    from public.ops2_customer_registration_journeys_v1 j
    join public.orders o on o.id=j.order_id
    where o.created_at>=v_since
      and o.source in ('vitrine','storefront_v2')
  )
  select jsonb_build_object(
    'generated_at',now(),
    'days',v_days,
    'recent_site_orders',(select count(*) from recent_orders),
    'recent_site_orders_incomplete_registration',(
      select count(*)
      from order_states os
      where os.customer_id is null
         or coalesce((os.state->>'registration_complete')::boolean,false)=false
    ),
    'distinct_customers_incomplete_registration',(
      select count(*)
      from customer_states cs
      where coalesce((cs.state->>'registration_complete')::boolean,false)=false
    ),
    'distinct_customers_registration_complete',(
      select count(*)
      from customer_states cs
      where coalesce((cs.state->>'registration_complete')::boolean,false)=true
    ),
    'distinct_customers_bling_ready_unlinked',(
      select count(*)
      from customer_states cs
      where coalesce((cs.state->>'bling_ready')::boolean,false)=true
        and coalesce((cs.state->>'already_linked_bling')::boolean,false)=false
    ),
    'flow_events_total',(
      select count(*)
      from public.papoai_customer_flow_events_v1 f
      where f.created_at>=v_since
    ),
    'flow_events_review',(
      select count(*)
      from public.papoai_customer_flow_events_v1 f
      where f.created_at>=v_since
        and f.status<>'processed'
    ),
    'registration_journeys_total',(select count(*) from journey_states),
    'registration_journeys_pending',(select count(*) from journey_states where registration_state='pending'),
    'registration_journeys_workflow_open',(select count(*) from journey_states where registration_state='pending' and workflow_open=true),
    'registration_journeys_complete',(select count(*) from journey_states where registration_state='complete'),
    'registration_transition_events',(
      select count(*)
      from public.ops_events e
      where e.occurred_at>=v_since
        and e.domain='customer'
        and e.event_type in ('customer.registration_required','customer.registration_completed','customer.registration_reopened')
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.ops2_customer_registration_summary_v1(integer) from public,anon,authenticated;
grant execute on function public.ops2_customer_registration_summary_v1(integer) to service_role;
