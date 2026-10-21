begin;

-- The post-sale journey records new order confirmations only. Intentionally do
-- not backfill existing orders: historic due dates must never become a send lot.
create table if not exists public.marketing_post_sale_runtime_v1 (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint marketing_post_sale_runtime_activation_consistency_v1
    check ((enabled is true and activated_at is not null)
        or (enabled is false and activated_at is null))
);

create or replace function private.marketing_post_sale_runtime_activation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.enabled is true then
      new.activated_at := clock_timestamp();
    else
      new.activated_at := null;
    end if;
  elsif new.enabled is true then
    if old.enabled is distinct from true then
      new.activated_at := clock_timestamp();
    else
      new.activated_at := old.activated_at;
    end if;
  else
    new.activated_at := null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

revoke all on function private.marketing_post_sale_runtime_activation_v1()
  from public, anon, authenticated;
drop trigger if exists marketing_post_sale_runtime_activation_v1
  on public.marketing_post_sale_runtime_v1;
create trigger marketing_post_sale_runtime_activation_v1
before insert or update on public.marketing_post_sale_runtime_v1
for each row execute function private.marketing_post_sale_runtime_activation_v1();

insert into public.marketing_post_sale_runtime_v1(id, enabled)
values (true, false)
on conflict (id) do nothing;
update public.marketing_post_sale_runtime_v1
   set enabled = false, activated_at = null, updated_at = clock_timestamp()
 where id = true;
alter table public.marketing_post_sale_runtime_v1 enable row level security;
revoke all on public.marketing_post_sale_runtime_v1 from public, anon, authenticated;
grant select, insert, update on public.marketing_post_sale_runtime_v1 to service_role;

-- The worker uses the same real basket photographs shown in the image bank,
-- published as JPEG copies so Meta can fetch the carousel media reliably.
create table if not exists private.marketing_post_sale_carousel_assets_v1 (
  card_index smallint primary key check (card_index between 0 and 4),
  basket_type text not null unique
    check (basket_type in ('economica','mini','pequena','media','grande')),
  image_url text not null check (
    image_url ~ '^https://www\.donaantonia\.com\.br/img/marketing-post-sale/(economica|mini|pequena|media|grande)\.jpg$'
  ),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table private.marketing_post_sale_carousel_assets_v1 enable row level security;
revoke all on table private.marketing_post_sale_carousel_assets_v1
  from public, anon, authenticated, service_role;
insert into private.marketing_post_sale_carousel_assets_v1(card_index,basket_type,image_url)
values
  (0,'economica','https://www.donaantonia.com.br/img/marketing-post-sale/economica.jpg'),
  (1,'mini','https://www.donaantonia.com.br/img/marketing-post-sale/mini.jpg'),
  (2,'pequena','https://www.donaantonia.com.br/img/marketing-post-sale/pequena.jpg'),
  (3,'media','https://www.donaantonia.com.br/img/marketing-post-sale/media.jpg'),
  (4,'grande','https://www.donaantonia.com.br/img/marketing-post-sale/grande.jpg')
on conflict (card_index) do update set
  basket_type=excluded.basket_type,image_url=excluded.image_url,enabled=true,
  updated_at=clock_timestamp();

create table if not exists private.marketing_post_sale_dispatches_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  to_phone_e164 text,
  template_name text,
  language_code text not null default 'pt_BR',
  due_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','claimed','accepted','failed','uncertain','suppressed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1),
  provider_message_id text,
  last_error text,
  blocked_reason text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_post_sale_dispatch_due_v1_idx
  on private.marketing_post_sale_dispatches_v1(status, due_at);
create index if not exists marketing_post_sale_dispatch_customer_v1_idx
  on private.marketing_post_sale_dispatches_v1(customer_id);
create index if not exists marketing_post_sale_dispatch_account_v1_idx
  on private.marketing_post_sale_dispatches_v1(whatsapp_account_id);
alter table private.marketing_post_sale_dispatches_v1 enable row level security;
revoke all on table private.marketing_post_sale_dispatches_v1
  from public, anon, authenticated;
grant select, insert, update on table private.marketing_post_sale_dispatches_v1
  to service_role;

create or replace function public.marketing_post_sale_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Inserts or idempotent writes that do not change journey inputs need no work.
  if tg_op = 'UPDATE'
     and new.customer_id is not distinct from old.customer_id
     and new.confirmed_at is not distinct from old.confirmed_at
     and new.cancelled_at is not distinct from old.cancelled_at
     and new.returned_at is not distinct from old.returned_at
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.cancelled_at is not null or lower(coalesce(new.status, '')) = 'cancelled' then
    update private.marketing_post_sale_dispatches_v1 d
       set status = 'suppressed', blocked_reason = 'order_cancelled',
           updated_at = clock_timestamp()
     where d.order_id = new.id and d.status in ('scheduled','claimed');
    return new;
  end if;

  if new.returned_at is not null or lower(coalesce(new.status, '')) = 'returned' then
    update private.marketing_post_sale_dispatches_v1 d
       set status = 'suppressed', blocked_reason = 'order_returned',
           updated_at = clock_timestamp()
     where d.order_id = new.id and d.status in ('scheduled','claimed');
    return new;
  end if;

  if new.confirmed_at is null or new.customer_id is null then
    update private.marketing_post_sale_dispatches_v1 d
       set status = 'suppressed', blocked_reason = 'order_not_confirmed',
           updated_at = clock_timestamp()
     where d.order_id = new.id and d.status in ('scheduled','claimed');
    return new;
  end if;

  insert into private.marketing_post_sale_dispatches_v1 as dispatch(
    order_id, customer_id, due_at, status, blocked_reason, updated_at
  ) values (
    new.id, new.customer_id, new.confirmed_at + interval '20 days',
    'scheduled', null, clock_timestamp()
  )
  on conflict (order_id) do update set
    customer_id = excluded.customer_id,
    due_at = excluded.due_at,
    status = 'scheduled',
    blocked_reason = null,
    claimed_at = null,
    finished_at = null,
    updated_at = clock_timestamp()
  where dispatch.status in ('scheduled','suppressed');

  return new;
exception when others then
  -- A marketing enqueue failure must not roll back order confirmation.
  raise warning 'marketing_post_sale_order_schedule_failed (sqlstate=%)', sqlstate;
  return new;
end
$$;

revoke all on function public.marketing_post_sale_order_trigger_v1()
  from public, anon, authenticated;
grant execute on function public.marketing_post_sale_order_trigger_v1()
  to service_role;

drop trigger if exists marketing_post_sale_order_after_write_v1 on public.orders;
create trigger marketing_post_sale_order_after_write_v1
after insert or update of customer_id, confirmed_at, cancelled_at, returned_at, status
on public.orders
for each row execute function public.marketing_post_sale_order_trigger_v1();

create or replace function private.marketing_post_sale_template_name_v1()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'carrossel_cestas_basicas_5_tipos_d20'::text
$$;

revoke all on function private.marketing_post_sale_template_name_v1()
  from public, anon, authenticated;

create or replace function public.marketing_post_sale_claim_due_v1(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.marketing_post_sale_runtime_v1
    where id is true and enabled is true and activated_at is not null
  ) then
    return jsonb_build_object('ok',true,'items',v_items,'reason','post_sale_runtime_disabled');
  end if;

  -- Expired/backlog rows remain visible for health review, but are never rewritten
  -- or claimed: only the due-time predicates below can make a row sendable.
  with candidates as (
    select d.id,
           a.id as whatsapp_account_id,
           public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) as to_phone_e164,
           private.marketing_post_sale_template_name_v1() as template_name
      from private.marketing_post_sale_dispatches_v1 d
      join public.marketing_post_sale_runtime_v1 rt
        on rt.id is true and rt.enabled is true and rt.activated_at is not null
      join public.orders o on o.id=d.order_id and o.customer_id=d.customer_id
        and o.confirmed_at is not null and o.cancelled_at is null
        and lower(coalesce(o.status,'')) not in ('cancelled','returned')
        and o.returned_at is null
      join public.customers c on c.id=d.customer_id and c.is_active is true
        and c.marketing_opt_in is true
      join public.marketing_customer_consent_current_v1 consent
        on consent.customer_id=c.id and consent.consent_state='opt_in'
        and consent.marketing_opt_in is true
        and consent.phone_e164=public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164)
      join public.whatsapp_accounts a on a.id=o.whatsapp_account_id
        and a.is_active is true
        and a.slug in ('dona-antonia-0975','dona-antonia-1018')
        and a.phone_e164 is not null
        and right(regexp_replace(a.phone_e164,'\D','','g'),4)=right(a.slug,4)
      join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
        and r.campaigns_enabled is true and r.send_enabled is true
        and r.outbound_provider='meta'
      join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
        and t.name=private.marketing_post_sale_template_name_v1()
        and t.language='pt_BR' and upper(t.status)='APPROVED'
        and upper(t.category)='MARKETING'
        and exists (
          select 1
            from jsonb_array_elements(
              case when jsonb_typeof(t.components)='array' then t.components else '[]'::jsonb end
            ) as carousel_component(component)
           where upper(carousel_component.component->>'type')='CAROUSEL'
             and case when jsonb_typeof(carousel_component.component->'cards')='array'
                      then jsonb_array_length(carousel_component.component->'cards')=5
                      else false end
        )
     where d.status='scheduled' and d.attempt_count=0
       and d.due_at<=clock_timestamp()
       and d.due_at>=rt.activated_at
       and d.due_at>=clock_timestamp()-interval '24 hours'
       and public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) ~ '^\+55[0-9]{10,11}$'
       and (select count(*)=5 from private.marketing_post_sale_carousel_assets_v1 where enabled is true)
     order by d.due_at,d.created_at,d.id
     limit greatest(1,least(coalesce(p_limit,10),25))
     for update of d skip locked
  ), claimed as (
    update private.marketing_post_sale_dispatches_v1 d
       set status='claimed',
           whatsapp_account_id=c.whatsapp_account_id,
           to_phone_e164=c.to_phone_e164,
           template_name=c.template_name,
           language_code='pt_BR',
           attempt_count=1,
           claimed_at=clock_timestamp(),
           blocked_reason=null,
           updated_at=clock_timestamp()
      from candidates c
     where d.id=c.id and d.status='scheduled' and d.attempt_count=0
    returning d.id,d.order_id,d.customer_id,d.whatsapp_account_id,d.to_phone_e164,
              d.template_name,d.language_code,d.due_at,d.claimed_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'order_id',c.order_id,'customer_id',c.customer_id,
    'whatsapp_account_id',c.whatsapp_account_id,'to_phone_e164',c.to_phone_e164,
    'template_name',c.template_name,'language_code',c.language_code,
    'due_at',c.due_at,'claimed_at',c.claimed_at
  ) order by c.due_at,c.id),'[]'::jsonb)
    into v_items from claimed c;

  return jsonb_build_object('ok',true,'items',v_items);
end
$$;

create or replace function public.marketing_post_sale_validate_dispatch_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  select jsonb_build_object(
    'id',d.id,'order_id',d.order_id,'customer_id',d.customer_id,
    'whatsapp_account_id',d.whatsapp_account_id,'phone_number_id',a.phone_number_id,
    'to_phone_e164',d.to_phone_e164,'template_name',d.template_name,
    'language_code',d.language_code,'template_components',t.components,
    'carousel_assets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'card_index',asset.card_index,'basket_type',asset.basket_type,'image_url',asset.image_url
      ) order by asset.card_index)
      from private.marketing_post_sale_carousel_assets_v1 asset
      where asset.enabled is true
    ),'[]'::jsonb)
  ) into v_item
  from private.marketing_post_sale_dispatches_v1 d
  join public.marketing_post_sale_runtime_v1 rt
    on rt.id is true and rt.enabled is true and rt.activated_at is not null
  join public.orders o on o.id=d.order_id and o.customer_id=d.customer_id
    and o.confirmed_at is not null and o.cancelled_at is null
    and lower(coalesce(o.status,'')) not in ('cancelled','returned')
    and o.returned_at is null
  join public.customers c on c.id=d.customer_id and c.is_active is true
    and c.marketing_opt_in is true
    and public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164)=d.to_phone_e164
  join public.marketing_customer_consent_current_v1 consent
    on consent.customer_id=c.id and consent.consent_state='opt_in'
    and consent.marketing_opt_in is true and consent.phone_e164=d.to_phone_e164
  join public.whatsapp_accounts a on a.id=d.whatsapp_account_id and a.id=o.whatsapp_account_id
    and a.is_active is true and a.phone_number_id ~ '^[0-9]{5,30}$'
    and a.phone_e164 is not null
    and right(regexp_replace(a.phone_e164,'\D','','g'),4)=right(a.slug,4)
  join public.whatsapp_channel_runtime_v1 r on r.whatsapp_account_id=a.id
    and r.campaigns_enabled is true and r.send_enabled is true
    and r.outbound_provider='meta'
  join public.whatsapp_templates_v1 t on t.whatsapp_account_id=a.id
    and t.name=d.template_name and t.name=private.marketing_post_sale_template_name_v1()
    and t.language=d.language_code and upper(t.status)='APPROVED'
    and upper(t.category)='MARKETING'
    and exists (
      select 1
        from jsonb_array_elements(
          case when jsonb_typeof(t.components)='array' then t.components else '[]'::jsonb end
        ) as carousel_component(component)
       where upper(carousel_component.component->>'type')='CAROUSEL'
         and case when jsonb_typeof(carousel_component.component->'cards')='array'
                  then jsonb_array_length(carousel_component.component->'cards')=5
                  else false end
    )
  where d.id=p_dispatch_id and d.status='claimed' and d.attempt_count=1
    and d.due_at<=clock_timestamp() and d.due_at>=rt.activated_at
    and d.due_at>=clock_timestamp()-interval '24 hours'
    and (select count(*)=5 from private.marketing_post_sale_carousel_assets_v1 where enabled is true);

  if v_item is null then
    update private.marketing_post_sale_dispatches_v1
       set status='suppressed',blocked_reason='eligibility_changed',
           finished_at=clock_timestamp(),updated_at=clock_timestamp()
     where id=p_dispatch_id and status='claimed';
    return jsonb_build_object('ok',false,'error','dispatch_not_eligible');
  end if;

  return jsonb_build_object('ok',true,'item',v_item);
end
$$;

create or replace function public.marketing_post_sale_finish_dispatch_v1(
  p_dispatch_id uuid,p_status text,p_provider_message_id text default null,p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if p_status is null or p_status not in ('accepted','failed','uncertain','suppressed') then
    return jsonb_build_object('ok',false,'error','invalid_status');
  end if;
  if p_status='accepted' and nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    return jsonb_build_object('ok',false,'error','provider_message_id_required');
  end if;

  update private.marketing_post_sale_dispatches_v1
     set status=p_status,
         provider_message_id=case when p_status='accepted' then nullif(btrim(p_provider_message_id),'') else null end,
         last_error=case when p_status='accepted' then null else left(coalesce(p_error,p_status),160) end,
         blocked_reason=case when p_status='suppressed' then left(coalesce(p_error,'suppressed'),160) else null end,
         finished_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=p_dispatch_id and status='claimed' and attempt_count=1
   returning order_id into v_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','dispatch_not_claimed');
  end if;
  return jsonb_build_object('ok',true,'status',p_status,'order_id',v_order_id);
end
$$;

revoke all on function public.marketing_post_sale_claim_due_v1(integer)
  from public, anon, authenticated;
revoke all on function public.marketing_post_sale_validate_dispatch_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.marketing_post_sale_finish_dispatch_v1(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.marketing_post_sale_claim_due_v1(integer) to service_role;
grant execute on function public.marketing_post_sale_validate_dispatch_v1(uuid) to service_role;
grant execute on function public.marketing_post_sale_finish_dispatch_v1(uuid,text,text,text) to service_role;

commit;
