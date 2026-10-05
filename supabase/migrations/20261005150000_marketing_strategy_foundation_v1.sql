begin;

-- Dona Antônia · Marketing Strategy Engine v1
-- Fundação local/auditável. Esta migration não chama Meta, worker nem altera runtime.

create table if not exists public.marketing_strategy_weight_sets_v1 (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(btrim(version)) between 1 and 80),
  weights jsonb not null check (jsonb_typeof(weights)='object'),
  is_active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists marketing_strategy_weight_sets_v1_one_active_uidx
  on public.marketing_strategy_weight_sets_v1(is_active)
  where is_active is true;

insert into public.marketing_strategy_weight_sets_v1(version,weights,is_active,metadata)
values (
  'v1',
  jsonb_build_object(
    'availability_stock',25,
    'seasonality',20,
    'audience_fit',20,
    'historical_performance',20,
    'exploration',10,
    'operational_quality',5
  ),
  true,
  jsonb_build_object('source','marketing_strategy_spec_v1','total',100)
)
on conflict (version) do nothing;

create table if not exists public.marketing_seasonality_rules_v1 (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  version integer not null default 1 check (version >= 1),
  name text not null check (length(btrim(name)) between 1 and 160),
  starts_on date,
  ends_on date,
  month_numbers smallint[] not null default '{}'::smallint[],
  day_of_month_start smallint check (day_of_month_start between 1 and 31),
  day_of_month_end smallint check (day_of_month_end between 1 and 31),
  priority integer not null default 0,
  score_effect numeric not null default 0 check (score_effect between -100 and 100),
  operational_closed boolean not null default false,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (rule_key,version),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create index if not exists marketing_seasonality_rules_v1_active_idx
  on public.marketing_seasonality_rules_v1(is_active,priority desc,starts_on,ends_on);

create table if not exists public.marketing_strategy_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in (
    'draft','awaiting_internal_approval','approved_internal','awaiting_meta',
    'meta_approved','meta_rejected','ready_to_send','send_approved','scheduled',
    'running','completed','discarded','blocked'
  )),
  objective text not null default 'weekly_basket_kit' check (length(btrim(objective)) between 1 and 120),
  audience_snapshot jsonb not null default '{}'::jsonb,
  offer_format text not null default 'single' check (offer_format in ('single','carousel')),
  copy_snapshot jsonb not null default '{}'::jsonb,
  schedule_suggestion timestamptz,
  score numeric not null default 0 check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  weight_set_id uuid references public.marketing_strategy_weight_sets_v1(id),
  weight_version_snapshot text,
  weight_snapshot jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  content_fingerprint text,
  revision integer not null default 1 check (revision >= 1),
  template_id uuid references public.whatsapp_templates_v1(id),
  campaign_id uuid references public.marketing_campaigns_v1(id),
  internal_approved_at timestamptz,
  internal_approved_by uuid,
  meta_submitted_at timestamptz,
  meta_approved_at timestamptz,
  meta_rejected_at timestamptz,
  send_approved_at timestamptz,
  send_approved_by uuid,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (period_start <= period_end)
);

create index if not exists marketing_strategy_runs_v1_status_period_idx
  on public.marketing_strategy_runs_v1(status,period_start desc,created_at desc);
create index if not exists marketing_strategy_runs_v1_account_idx
  on public.marketing_strategy_runs_v1(whatsapp_account_id,created_at desc);
create index if not exists marketing_strategy_runs_v1_campaign_idx
  on public.marketing_strategy_runs_v1(campaign_id)
  where campaign_id is not null;

create table if not exists public.marketing_strategy_offers_v1 (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.marketing_strategy_runs_v1(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  source_kind text not null check (source_kind in ('basket','kit')),
  commercial_id uuid not null,
  public_lot_id uuid,
  public_name text not null,
  image_url text,
  category_id uuid,
  category_name text,
  sale_price_snapshot numeric not null check (sale_price_snapshot >= 0),
  public_available_snapshot integer not null check (public_available_snapshot >= 0),
  availability_reason_snapshot text not null,
  score numeric not null default 0 check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (strategy_id,position)
);

create index if not exists marketing_strategy_offers_v1_strategy_idx
  on public.marketing_strategy_offers_v1(strategy_id,position);
create index if not exists marketing_strategy_offers_v1_commercial_idx
  on public.marketing_strategy_offers_v1(commercial_id,created_at desc);

create table if not exists public.marketing_strategy_events_v1 (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.marketing_strategy_runs_v1(id),
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  strategy_revision integer not null check (strategy_revision >= 1),
  from_status text,
  to_status text,
  actor_user_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_strategy_events_v1_strategy_idx
  on public.marketing_strategy_events_v1(strategy_id,created_at,id);

create table if not exists public.marketing_template_lifecycle_v1 (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null unique references public.whatsapp_templates_v1(id),
  protected boolean not null default false,
  lifecycle_status text not null default 'active' check (lifecycle_status in (
    'active','in_use','retired','deletion_candidate','delete_approved','deleted_meta'
  )),
  last_used_at timestamptz,
  retired_at timestamptz,
  candidate_after timestamptz,
  delete_requested_at timestamptz,
  delete_requested_by uuid,
  delete_approved_at timestamptz,
  delete_approved_by uuid,
  meta_deleted_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists marketing_template_lifecycle_v1_cleanup_idx
  on public.marketing_template_lifecycle_v1(protected,lifecycle_status,candidate_after,last_used_at);

create table if not exists public.marketing_attribution_events_v1 (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references public.marketing_strategy_runs_v1(id),
  campaign_id uuid references public.marketing_campaigns_v1(id),
  customer_id uuid references public.customers(id),
  order_id uuid references public.orders(id),
  commercial_id uuid,
  public_lot_id uuid,
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  attribution_kind text check (attribution_kind is null or attribution_kind in ('direct','assisted')),
  amount numeric check (amount is null or amount >= 0),
  token_hash text,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (idempotency_key)
);

create index if not exists marketing_attribution_events_v1_strategy_idx
  on public.marketing_attribution_events_v1(strategy_id,occurred_at desc);
create index if not exists marketing_attribution_events_v1_campaign_idx
  on public.marketing_attribution_events_v1(campaign_id,occurred_at desc);
create index if not exists marketing_attribution_events_v1_customer_idx
  on public.marketing_attribution_events_v1(customer_id,occurred_at desc);
create index if not exists marketing_attribution_events_v1_order_idx
  on public.marketing_attribution_events_v1(order_id)
  where order_id is not null;

alter table public.marketing_campaigns_v1 add column if not exists strategy_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='marketing_campaigns_v1_strategy_id_fkey'
      and conrelid='public.marketing_campaigns_v1'::regclass
  ) then
    alter table public.marketing_campaigns_v1
      add constraint marketing_campaigns_v1_strategy_id_fkey
      foreign key(strategy_id) references public.marketing_strategy_runs_v1(id) on delete set null;
  end if;
end$$;

create index if not exists marketing_campaigns_v1_strategy_idx
  on public.marketing_campaigns_v1(strategy_id)
  where strategy_id is not null;

create or replace function public.marketing_strategy_events_immutable_v1()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception 'marketing_strategy_events_append_only' using errcode='55000';
end;
$$;

revoke all on function public.marketing_strategy_events_immutable_v1() from public, anon, authenticated;
grant execute on function public.marketing_strategy_events_immutable_v1() to service_role;

drop trigger if exists marketing_strategy_events_v1_immutable on public.marketing_strategy_events_v1;
create trigger marketing_strategy_events_v1_immutable
before update or delete on public.marketing_strategy_events_v1
for each row execute function public.marketing_strategy_events_immutable_v1();

create or replace function public.marketing_strategy_append_event_v1(
  p_strategy_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_run public.marketing_strategy_runs_v1%rowtype;
  v_event_id uuid;
begin
  select * into v_run
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id;

  if not found then
    return jsonb_build_object('ok',false,'error','strategy_not_found');
  end if;

  if nullif(btrim(coalesce(p_event_type,'')),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_event_type');
  end if;

  insert into public.marketing_strategy_events_v1(
    strategy_id,event_type,strategy_revision,from_status,to_status,actor_user_id,metadata
  ) values (
    v_run.id,btrim(p_event_type),v_run.revision,v_run.status,v_run.status,p_actor_user_id,coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_event_id;

  return jsonb_build_object('ok',true,'event_id',v_event_id,'strategy_id',v_run.id,'revision',v_run.revision,'status',v_run.status);
end;
$$;

create or replace function public.marketing_strategy_transition_v1(
  p_strategy_id uuid,
  p_expected_revision integer,
  p_to_status text,
  p_actor_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_run public.marketing_strategy_runs_v1%rowtype;
  v_from text;
  v_to text:=lower(btrim(coalesce(p_to_status,'')));
  v_allowed boolean:=false;
begin
  if p_expected_revision is null or p_expected_revision < 1 or v_to='' then
    return jsonb_build_object('ok',false,'error','invalid_transition');
  end if;

  select * into v_run
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','strategy_not_found');
  end if;
  if v_run.revision<>p_expected_revision then
    return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_run.revision,'status',v_run.status);
  end if;

  v_from:=v_run.status;
  v_allowed:=case v_from
    when 'draft' then v_to in ('awaiting_internal_approval','discarded')
    when 'awaiting_internal_approval' then v_to in ('draft','approved_internal','discarded')
    when 'approved_internal' then v_to in ('awaiting_meta','meta_approved','discarded','blocked')
    when 'awaiting_meta' then v_to in ('meta_approved','meta_rejected','blocked')
    when 'meta_rejected' then v_to in ('draft','discarded')
    when 'meta_approved' then v_to in ('ready_to_send','blocked')
    when 'ready_to_send' then v_to in ('draft','send_approved','discarded','blocked')
    when 'send_approved' then v_to in ('scheduled','running','blocked')
    when 'scheduled' then v_to in ('running','discarded','blocked')
    when 'running' then v_to in ('completed','blocked')
    when 'blocked' then v_to in ('draft','awaiting_internal_approval','discarded')
    else false
  end;

  if not v_allowed then
    return jsonb_build_object('ok',false,'error','strategy_invalid_transition','from_status',v_from,'to_status',v_to);
  end if;

  update public.marketing_strategy_runs_v1
  set status=v_to,
      revision=revision+1,
      internal_approved_at=case when v_to='approved_internal' then now() else internal_approved_at end,
      internal_approved_by=case when v_to='approved_internal' then p_actor_user_id else internal_approved_by end,
      meta_submitted_at=case when v_to='awaiting_meta' then now() else meta_submitted_at end,
      meta_approved_at=case when v_to='meta_approved' then now() else meta_approved_at end,
      meta_rejected_at=case when v_to='meta_rejected' then now() else meta_rejected_at end,
      send_approved_at=case when v_to='send_approved' then now() else send_approved_at end,
      send_approved_by=case when v_to='send_approved' then p_actor_user_id else send_approved_by end,
      completed_at=case when v_to='completed' then now() else completed_at end,
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  insert into public.marketing_strategy_events_v1(
    strategy_id,event_type,strategy_revision,from_status,to_status,actor_user_id,reason,metadata
  ) values (
    v_run.id,'status_transition',v_run.revision,v_from,v_to,p_actor_user_id,nullif(btrim(coalesce(p_reason,'')),''),
    jsonb_build_object('expected_revision',p_expected_revision)
  );

  return jsonb_build_object('ok',true,'strategy_id',v_run.id,'revision',v_run.revision,'status',v_run.status);
end;
$$;

create or replace function public.marketing_strategy_detail_v1(p_strategy_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_run public.marketing_strategy_runs_v1%rowtype;
  v_offers jsonb;
  v_events jsonb;
begin
  select * into v_run from public.marketing_strategy_runs_v1 where id=p_strategy_id;
  if not found then
    return jsonb_build_object('ok',false,'error','strategy_not_found');
  end if;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.position),'[]'::jsonb)
  into v_offers
  from public.marketing_strategy_offers_v1 o
  where o.strategy_id=v_run.id;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb)
  into v_events
  from public.marketing_strategy_events_v1 e
  where e.strategy_id=v_run.id;

  return jsonb_build_object(
    'ok',true,
    'strategy',to_jsonb(v_run),
    'offers',v_offers,
    'events',v_events
  );
end;
$$;

alter table public.marketing_strategy_weight_sets_v1 enable row level security;
alter table public.marketing_seasonality_rules_v1 enable row level security;
alter table public.marketing_strategy_runs_v1 enable row level security;
alter table public.marketing_strategy_offers_v1 enable row level security;
alter table public.marketing_strategy_events_v1 enable row level security;
alter table public.marketing_template_lifecycle_v1 enable row level security;
alter table public.marketing_attribution_events_v1 enable row level security;

revoke all on table public.marketing_strategy_weight_sets_v1 from public, anon, authenticated;
revoke all on table public.marketing_seasonality_rules_v1 from public, anon, authenticated;
revoke all on table public.marketing_strategy_runs_v1 from public, anon, authenticated;
revoke all on table public.marketing_strategy_offers_v1 from public, anon, authenticated;
revoke all on table public.marketing_strategy_events_v1 from public, anon, authenticated;
revoke all on table public.marketing_template_lifecycle_v1 from public, anon, authenticated;
revoke all on table public.marketing_attribution_events_v1 from public, anon, authenticated;

grant select,insert,update,delete on table public.marketing_strategy_weight_sets_v1 to service_role;
grant select,insert,update,delete on table public.marketing_seasonality_rules_v1 to service_role;
grant select,insert,update,delete on table public.marketing_strategy_runs_v1 to service_role;
grant select,insert,update,delete on table public.marketing_strategy_offers_v1 to service_role;
grant select,insert on table public.marketing_strategy_events_v1 to service_role;
grant select,insert,update,delete on table public.marketing_template_lifecycle_v1 to service_role;
grant select,insert,update,delete on table public.marketing_attribution_events_v1 to service_role;

revoke all on function public.marketing_strategy_append_event_v1(uuid,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.marketing_strategy_transition_v1(uuid,integer,text,uuid,text) from public, anon, authenticated;
revoke all on function public.marketing_strategy_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_strategy_append_event_v1(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.marketing_strategy_transition_v1(uuid,integer,text,uuid,text) to service_role;
grant execute on function public.marketing_strategy_detail_v1(uuid) to service_role;

commit;
