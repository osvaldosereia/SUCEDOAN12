-- CM-1.12 Meta Foundation v1
-- Contract-first Meta Control Plane. No external Meta action is enabled.

alter table public.whatsapp_direct_templates
  add column if not exists meta_template_id text,
  add column if not exists current_version integer not null default 1,
  add column if not exists last_submitted_at timestamptz,
  add column if not exists last_status_checked_at timestamptz,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.whatsapp_direct_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.whatsapp_direct_templates(template_key) on delete cascade,
  version integer not null check (version>0),
  body_text text not null,
  category text not null,
  language_code text not null,
  media_kind text not null default 'none',
  media_url text,
  buttons jsonb not null default '[]'::jsonb,
  components jsonb not null default '[]'::jsonb,
  purpose text not null,
  source text not null default 'local',
  meta_status text not null default 'not_submitted',
  meta_template_id text,
  meta_rejection_reason text,
  provider_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_key,version),
  check(jsonb_typeof(buttons)='array'),
  check(jsonb_typeof(components)='array'),
  check(jsonb_typeof(provider_snapshot)='object')
);

create table if not exists public.meta_policy_registry (
  policy_key text primary key,
  version integer not null default 1 check(version>0),
  title text not null,
  capability text,
  rule_text text not null,
  restrictions jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  source_url text,
  effective_at timestamptz,
  reviewed_at timestamptz,
  status text not null default 'draft'
    check(status in ('draft','active','superseded','needs_review')),
  fail_closed boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(restrictions)='object'),
  check(jsonb_typeof(requirements)='object'),
  check(jsonb_typeof(metadata)='object')
);

create table if not exists public.meta_account_permissions (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  permission_key text not null,
  status text not null default 'unknown'
    check(status in ('unknown','granted','missing','expired','revoked','not_applicable')),
  source text not null default 'manual',
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(channel_account_id,permission_key),
  check(jsonb_typeof(evidence)='object')
);

create table if not exists public.meta_flow_registry (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  local_key text not null,
  meta_flow_id text,
  name text not null,
  status text not null default 'draft'
    check(status in ('draft','published','deprecated','blocked','unknown')),
  categories text[] not null default '{}'::text[],
  data_endpoint_uri text,
  json_version text,
  data_api_version text,
  health_status text not null default 'unknown',
  last_health_at timestamptz,
  provider_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_account_id,local_key),
  check(jsonb_typeof(provider_snapshot)='object')
);

create table if not exists public.meta_provider_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  provider text not null default 'meta_cloud_api',
  provider_state text not null default 'unknown'
    check(provider_state in ('unknown','disconnected','read_only','homologation','canary','live','degraded','blocked')),
  graph_api_version text,
  waba_id text,
  phone_number_id text,
  phone_quality text,
  account_quality text,
  messaging_limit text,
  webhook_state text,
  template_state text,
  flow_state text,
  health_score numeric(5,2) check(health_score is null or (health_score>=0 and health_score<=100)),
  errors jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  provider_snapshot jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check(jsonb_typeof(errors)='array'),
  check(jsonb_typeof(capabilities)='object'),
  check(jsonb_typeof(permissions)='object'),
  check(jsonb_typeof(provider_snapshot)='object')
);

create index if not exists meta_provider_health_snapshots_account_idx
  on public.meta_provider_health_snapshots(channel_account_id,checked_at desc);

create table if not exists public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  event_name text not null,
  object_type text,
  provider_event_id text,
  payload_hash text not null,
  signature_verified boolean,
  normalized_event_id uuid references public.normalized_channel_events(id) on delete set null,
  processing_status text not null default 'received'
    check(processing_status in ('received','normalized','ignored','failed')),
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  unique(payload_hash),
  check(jsonb_typeof(metadata)='object')
);

create table if not exists public.meta_control_plane_errors (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  operation text not null,
  provider_error_code text,
  provider_error_subcode text,
  message text,
  retryable boolean,
  severity text not null default 'error' check(severity in ('info','warning','error','critical')),
  request_ref text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  check(jsonb_typeof(metadata)='object')
);

create index if not exists meta_control_plane_errors_account_idx
  on public.meta_control_plane_errors(channel_account_id,occurred_at desc);

alter table public.whatsapp_direct_template_versions enable row level security;
alter table public.meta_policy_registry enable row level security;
alter table public.meta_account_permissions enable row level security;
alter table public.meta_flow_registry enable row level security;
alter table public.meta_provider_health_snapshots enable row level security;
alter table public.meta_webhook_events enable row level security;
alter table public.meta_control_plane_errors enable row level security;

revoke all on table public.whatsapp_direct_template_versions from public,anon,authenticated;
revoke all on table public.meta_policy_registry from public,anon,authenticated;
revoke all on table public.meta_account_permissions from public,anon,authenticated;
revoke all on table public.meta_flow_registry from public,anon,authenticated;
revoke all on table public.meta_provider_health_snapshots from public,anon,authenticated;
revoke all on table public.meta_webhook_events from public,anon,authenticated;
revoke all on table public.meta_control_plane_errors from public,anon,authenticated;

grant select,insert,update,delete on table public.whatsapp_direct_template_versions to service_role;
grant select,insert,update,delete on table public.meta_policy_registry to service_role;
grant select,insert,update,delete on table public.meta_account_permissions to service_role;
grant select,insert,update,delete on table public.meta_flow_registry to service_role;
grant select,insert,update,delete on table public.meta_provider_health_snapshots to service_role;
grant select,insert,update,delete on table public.meta_webhook_events to service_role;
grant select,insert,update,delete on table public.meta_control_plane_errors to service_role;

-- Seed local versions from existing templates without submitting anything to Meta.
insert into public.whatsapp_direct_template_versions(
  template_key,version,body_text,category,language_code,media_kind,media_url,buttons,purpose,
  source,meta_status,meta_template_id,provider_snapshot
)
select
  t.template_key,
  greatest(1,coalesce(t.current_version,1)),
  t.body_text,t.category,t.language_code,t.media_kind,t.media_url,t.buttons,t.purpose,
  'legacy_import',
  case when t.meta_status in ('approved','rejected','pending','paused','disabled') then t.meta_status else 'not_submitted' end,
  t.meta_template_id,
  jsonb_build_object('legacy_meta_status',t.meta_status)
from public.whatsapp_direct_templates t
on conflict(template_key,version) do nothing;

-- Mark the existing channel account as contract-ready but keep Meta direct fail-closed.
update public.channel_accounts ca
set capabilities=coalesce(ca.capabilities,'{}'::jsonb)||jsonb_build_object(
      'meta_control_plane_contract',true,
      'meta_direct_ready',false,
      'meta_direct_outbound_enabled',false
    ),
    metadata=coalesce(ca.metadata,'{}'::jsonb)||jsonb_build_object(
      'meta_control_plane_version','cm1.12-v1',
      'meta_provider_state','read_only',
      'graph_api_version',null,
      'direct_activation_requires_homologation',true
    ),
    updated_at=now()
where ca.channel='whatsapp';

create or replace view public.meta_control_plane_account_v1
with (security_invoker=true)
as
with latest_health as (
  select distinct on (h.channel_account_id)
    h.*
  from public.meta_provider_health_snapshots h
  order by h.channel_account_id,h.checked_at desc
),
template_stats as (
  select
    count(*)::int template_count,
    count(*) filter(where enabled)::int enabled_templates,
    count(*) filter(where meta_status='approved')::int approved_templates,
    count(*) filter(where meta_status='pending')::int pending_templates,
    count(*) filter(where meta_status='rejected')::int rejected_templates
  from public.whatsapp_direct_templates
),
flow_stats as (
  select
    channel_account_id,
    count(*)::int flow_count,
    count(*) filter(where status='published')::int published_flows,
    count(*) filter(where health_status in ('available','healthy'))::int healthy_flows
  from public.meta_flow_registry
  group by channel_account_id
),
permission_stats as (
  select
    channel_account_id,
    count(*)::int permission_count,
    count(*) filter(where status='granted')::int granted_permissions,
    count(*) filter(where status in ('missing','expired','revoked'))::int blocking_permissions
  from public.meta_account_permissions
  group by channel_account_id
)
select
  ca.id channel_account_id,
  ca.channel,
  ca.display_name,
  ca.status channel_status,
  ca.external_account_id phone_number_id,
  wa.waba_id,
  wa.phone_e164,
  ca.inbound_enabled,
  ca.outbound_enabled,
  ca.ai_enabled,
  ca.auto_reply_enabled,
  ca.canary_percent,
  ca.capabilities,
  ca.metadata,
  coalesce(lh.provider_state,'read_only') provider_state,
  lh.graph_api_version,
  lh.phone_quality,
  lh.account_quality,
  lh.messaging_limit,
  lh.webhook_state,
  lh.template_state,
  lh.flow_state,
  lh.health_score,
  lh.checked_at health_checked_at,
  coalesce(ts.template_count,0) template_count,
  coalesce(ts.enabled_templates,0) enabled_templates,
  coalesce(ts.approved_templates,0) approved_templates,
  coalesce(ts.pending_templates,0) pending_templates,
  coalesce(ts.rejected_templates,0) rejected_templates,
  coalesce(fs.flow_count,0) flow_count,
  coalesce(fs.published_flows,0) published_flows,
  coalesce(fs.healthy_flows,0) healthy_flows,
  coalesce(ps.permission_count,0) permission_count,
  coalesce(ps.granted_permissions,0) granted_permissions,
  coalesce(ps.blocking_permissions,0) blocking_permissions,
  case
    when ca.outbound_enabled then 'blocked_misconfiguration'
    when coalesce((ca.capabilities->>'meta_direct_ready')::boolean,false) then 'ready_for_homologation'
    else 'foundation_only'
  end readiness_state
from public.channel_accounts ca
left join public.whatsapp_accounts wa
  on wa.phone_number_id=ca.external_account_id
left join latest_health lh on lh.channel_account_id=ca.id
cross join template_stats ts
left join flow_stats fs on fs.channel_account_id=ca.id
left join permission_stats ps on ps.channel_account_id=ca.id
where ca.channel='whatsapp';

create or replace function public.get_meta_control_plane_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
select jsonb_build_object(
  'version','cm1.12-v1',
  'accounts',coalesce((
    select jsonb_agg(to_jsonb(a) order by a.display_name)
    from public.meta_control_plane_account_v1 a
  ),'[]'::jsonb),
  'policy_registry',jsonb_build_object(
    'total',(select count(*) from public.meta_policy_registry),
    'active',(select count(*) from public.meta_policy_registry where status='active'),
    'needs_review',(select count(*) from public.meta_policy_registry where status='needs_review')
  ),
  'webhook_events_24h',(select count(*) from public.meta_webhook_events where received_at>=now()-interval '24 hours'),
  'unresolved_errors',(select count(*) from public.meta_control_plane_errors where resolved_at is null),
  'external_side_effect',false
)
$function$;

revoke all on function public.get_meta_control_plane_snapshot_v1()
from public,anon,authenticated;
grant execute on function public.get_meta_control_plane_snapshot_v1()
to service_role;

create or replace function public.evaluate_meta_direct_readiness_v1(
  p_channel_account_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with a as (
  select * from public.meta_control_plane_account_v1
  where channel_account_id=p_channel_account_id
),
checks as (
  select
    a.*,
    (a.waba_id is not null and btrim(a.waba_id)<>'') has_waba,
    (a.phone_number_id is not null and btrim(a.phone_number_id)<>'') has_phone_number_id,
    (coalesce(a.graph_api_version,'')<>'') has_graph_api_version,
    (a.blocking_permissions=0 and a.permission_count>0) permissions_clear,
    (coalesce(a.webhook_state,'') in ('healthy','verified','configured')) webhook_ready,
    (coalesce((a.capabilities->>'meta_direct_ready')::boolean,false)) direct_ready_flag
  from a
)
select coalesce((
  select jsonb_build_object(
    'channel_account_id',channel_account_id,
    'ready',(
      has_waba and has_phone_number_id and has_graph_api_version
      and permissions_clear and webhook_ready and direct_ready_flag
      and outbound_enabled=false
    ),
    'mode','READ_ONLY',
    'checks',jsonb_build_object(
      'waba',has_waba,
      'phone_number_id',has_phone_number_id,
      'graph_api_version',has_graph_api_version,
      'permissions_clear',permissions_clear,
      'webhook_ready',webhook_ready,
      'direct_ready_flag',direct_ready_flag,
      'outbound_fail_closed',(outbound_enabled=false)
    ),
    'blocking_reasons',to_jsonb(array_remove(array[
      case when not has_waba then 'waba_missing' end,
      case when not has_phone_number_id then 'phone_number_id_missing' end,
      case when not has_graph_api_version then 'graph_api_version_unverified' end,
      case when not permissions_clear then 'permissions_unverified_or_blocking' end,
      case when not webhook_ready then 'webhook_not_verified' end,
      case when not direct_ready_flag then 'direct_ready_flag_false' end,
      case when outbound_enabled then 'outbound_must_remain_disabled' end
    ],null)),
    'external_side_effect',false,
    'version','cm1.12-v1'
  )
  from checks
),'{}'::jsonb)
$function$;

revoke all on function public.evaluate_meta_direct_readiness_v1(uuid)
from public,anon,authenticated;
grant execute on function public.evaluate_meta_direct_readiness_v1(uuid)
to service_role;
