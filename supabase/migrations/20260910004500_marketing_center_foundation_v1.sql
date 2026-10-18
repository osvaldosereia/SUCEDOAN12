begin;

-- Marketing Center V1 — foundation only.
-- No Make, no external publication, no paid provider and no AI call are executed here.
-- Every runtime/publishing gate starts OFF and kill_switch starts ON.

create table if not exists public.marketing_runtime_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  execution_mode text not null default 'off' check (execution_mode in ('off','observe','dry_run','draft','homologation','canary','live')),
  canary_percent smallint not null default 0 check (canary_percent between 0 and 100),
  kill_switch boolean not null default true,
  generation_enabled boolean not null default false,
  deterministic_render_enabled boolean not null default false,
  ai_image_enabled boolean not null default false,
  ai_video_enabled boolean not null default false,
  publishing_enabled boolean not null default false,
  whatsapp_status_publish_enabled boolean not null default false,
  instagram_story_publish_enabled boolean not null default false,
  facebook_story_publish_enabled boolean not null default false,
  instagram_carousel_publish_enabled boolean not null default false,
  pinterest_publish_enabled boolean not null default false,
  google_business_publish_enabled boolean not null default false,
  require_approval boolean not null default true,
  default_timezone text not null default 'America/Cuiaba',
  max_daily_publications smallint not null default 0 check (max_daily_publications between 0 and 500),
  max_daily_ai_image_generations smallint not null default 0 check (max_daily_ai_image_generations between 0 and 500),
  max_daily_ai_video_seconds integer not null default 0 check (max_daily_ai_video_seconds between 0 and 36000),
  max_daily_ai_cost_cents integer not null default 0 check (max_daily_ai_cost_cents between 0 and 10000000),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.marketing_runtime_config(id) values(1) on conflict (id) do nothing;

create table if not exists public.marketing_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post')),
  provider text not null check (provider in ('meta','pinterest','google')),
  display_name text not null,
  external_account_id text,
  credential_ref text,
  status text not null default 'disconnected' check (status in ('disconnected','configured','verified','error','disabled')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel, external_account_id)
);

create table if not exists public.marketing_command_presets (
  id uuid primary key default gen_random_uuid(),
  command_key text not null,
  version integer not null check (version > 0),
  name text not null,
  media_kind text not null check (media_kind in ('image','video','carousel','caption')),
  generation_mode text not null check (generation_mode in ('no_ai','ai','hybrid','manual')),
  provider_hint text not null default 'auto',
  command_text text not null,
  negative_prompt text,
  variables jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(command_key, version)
);

create table if not exists public.marketing_content_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version integer not null check (version > 0),
  name text not null,
  media_kind text not null check (media_kind in ('image','video','carousel')),
  canvas_spec jsonb not null default '{}'::jsonb,
  layout_spec jsonb not null default '{}'::jsonb,
  brand_spec jsonb not null default '{}'::jsonb,
  variable_schema jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(template_key, version)
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft','review','approved','scheduled','paused','completed','cancelled')),
  enabled boolean not null default false,
  execution_mode text not null default 'off' check (execution_mode in ('off','observe','dry_run','draft','homologation','canary','live')),
  canary_percent smallint not null default 0 check (canary_percent between 0 and 100),
  kill_switch boolean not null default true,
  content_policy jsonb not null default '{}'::jsonb,
  product_selection jsonb not null default '{}'::jsonb,
  schedule_rule jsonb not null default '{}'::jsonb,
  channel_plan jsonb not null default '{}'::jsonb,
  ai_policy jsonb not null default '{"mode":"optional","image":"optional","video":"optional"}'::jsonb,
  approval_policy jsonb not null default '{"required":true}'::jsonb,
  max_cost_cents integer not null default 0 check (max_cost_cents >= 0),
  max_publications_per_day smallint not null default 0 check (max_publications_per_day between 0 and 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  parent_asset_id uuid references public.marketing_assets(id) on delete set null,
  version integer not null default 1 check (version > 0),
  title text not null,
  media_kind text not null check (media_kind in ('image','video','carousel')),
  generation_mode text not null check (generation_mode in ('no_ai','ai','hybrid','manual')),
  template_id uuid references public.marketing_content_templates(id) on delete set null,
  command_preset_id uuid references public.marketing_command_presets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','render_queued','rendered','review','approved','failed','archived')),
  source_refs jsonb not null default '[]'::jsonb,
  edit_spec jsonb not null default '{}'::jsonb,
  render_spec jsonb not null default '{}'::jsonb,
  output_spec jsonb not null default '{}'::jsonb,
  editable boolean not null default true,
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  actual_cost_cents integer not null default 0 check (actual_cost_cents >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_publication_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  asset_id uuid references public.marketing_assets(id) on delete set null,
  channel text not null check (channel in ('whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post')),
  content_type text not null check (content_type in ('image','video','carousel','post')),
  status text not null default 'draft' check (status in ('draft','blocked','review','approved','scheduled','ready_manual','publishing','published','failed','cancelled','review_required')),
  manual_confirmation_required boolean not null default true,
  scheduled_for timestamptz,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  external_ref text,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  last_error text,
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text,
  event_type text not null,
  actor_id uuid,
  data jsonb not null default '{}'::jsonb,
  external_side_effect boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns(status, created_at desc);
create index if not exists marketing_assets_status_idx on public.marketing_assets(status, created_at desc);
create index if not exists marketing_publication_jobs_due_idx on public.marketing_publication_jobs(status, scheduled_for) where status in ('draft','review','approved','scheduled','ready_manual','review_required');
create index if not exists marketing_events_entity_idx on public.marketing_events(entity_type, entity_id, created_at desc);

alter table public.marketing_runtime_config enable row level security;
alter table public.marketing_channel_accounts enable row level security;
alter table public.marketing_command_presets enable row level security;
alter table public.marketing_content_templates enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_assets enable row level security;
alter table public.marketing_publication_jobs enable row level security;
alter table public.marketing_events enable row level security;

revoke all on table public.marketing_runtime_config from public, anon, authenticated;
revoke all on table public.marketing_channel_accounts from public, anon, authenticated;
revoke all on table public.marketing_command_presets from public, anon, authenticated;
revoke all on table public.marketing_content_templates from public, anon, authenticated;
revoke all on table public.marketing_campaigns from public, anon, authenticated;
revoke all on table public.marketing_assets from public, anon, authenticated;
revoke all on table public.marketing_publication_jobs from public, anon, authenticated;
revoke all on table public.marketing_events from public, anon, authenticated;

grant select,insert,update on table public.marketing_runtime_config to service_role;
grant select,insert,update on table public.marketing_channel_accounts to service_role;
grant select,insert,update on table public.marketing_command_presets to service_role;
grant select,insert,update on table public.marketing_content_templates to service_role;
grant select,insert,update on table public.marketing_campaigns to service_role;
grant select,insert,update on table public.marketing_assets to service_role;
grant select,insert,update on table public.marketing_publication_jobs to service_role;
grant select,insert on table public.marketing_events to service_role;
grant usage,select on sequence public.marketing_events_id_seq to service_role;

create or replace function public.marketing_readiness_v1()
returns jsonb
language sql
security invoker
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'runtime', to_jsonb(c),
    'channels', jsonb_build_object(
      'whatsapp_status', jsonb_build_object('publish_gate',c.whatsapp_status_publish_enabled,'publication_path','manual_confirm','manual_confirmation_required',true),
      'instagram_story', jsonb_build_object('publish_gate',c.instagram_story_publish_enabled,'publication_path','official_api_planned','manual_confirmation_required',false),
      'facebook_story', jsonb_build_object('publish_gate',c.facebook_story_publish_enabled,'publication_path','official_api_planned','manual_confirmation_required',false),
      'instagram_carousel', jsonb_build_object('publish_gate',c.instagram_carousel_publish_enabled,'publication_path','official_api_planned','manual_confirmation_required',false),
      'pinterest_pin', jsonb_build_object('publish_gate',c.pinterest_publish_enabled,'publication_path','official_api_planned','manual_confirmation_required',false),
      'google_business_post', jsonb_build_object('publish_gate',c.google_business_publish_enabled,'publication_path','official_api_planned','manual_confirmation_required',false)
    ),
    'counts', jsonb_build_object(
      'commands',(select count(*) from public.marketing_command_presets),
      'templates',(select count(*) from public.marketing_content_templates),
      'campaigns',(select count(*) from public.marketing_campaigns),
      'assets',(select count(*) from public.marketing_assets),
      'publication_jobs',(select count(*) from public.marketing_publication_jobs)
    ),
    'external_side_effect', false
  )
  from public.marketing_runtime_config c where c.id=1
$$;

create or replace function public.create_marketing_command_draft_v1(
  p_command_key text,
  p_name text,
  p_media_kind text,
  p_generation_mode text,
  p_command_text text,
  p_provider_hint text default 'auto',
  p_negative_prompt text default null,
  p_variables jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_key text:=lower(regexp_replace(trim(coalesce(p_command_key,'')),'[^a-zA-Z0-9_-]+','_','g'));
  v_version integer;
  v_id uuid;
begin
  if length(v_key)<2 or length(v_key)>100 then return jsonb_build_object('ok',false,'error','invalid_command_key','external_side_effect',false); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('ok',false,'error','name_required','external_side_effect',false); end if;
  if p_media_kind not in ('image','video','carousel','caption') then return jsonb_build_object('ok',false,'error','invalid_media_kind','external_side_effect',false); end if;
  if p_generation_mode not in ('no_ai','ai','hybrid','manual') then return jsonb_build_object('ok',false,'error','invalid_generation_mode','external_side_effect',false); end if;
  if length(trim(coalesce(p_command_text,'')))<3 then return jsonb_build_object('ok',false,'error','command_required','external_side_effect',false); end if;
  select coalesce(max(version),0)+1 into v_version from public.marketing_command_presets where command_key=v_key;
  insert into public.marketing_command_presets(command_key,version,name,media_kind,generation_mode,provider_hint,command_text,negative_prompt,variables,settings,created_by)
  values(v_key,v_version,trim(p_name),p_media_kind,p_generation_mode,left(trim(coalesce(p_provider_hint,'auto')),80),trim(p_command_text),nullif(trim(coalesce(p_negative_prompt,'')),''),coalesce(p_variables,'{}'::jsonb),coalesce(p_settings,'{}'::jsonb),p_actor)
  returning id into v_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('command',v_id::text,'draft_created',p_actor,jsonb_build_object('command_key',v_key,'version',v_version));
  return jsonb_build_object('ok',true,'id',v_id,'command_key',v_key,'version',v_version,'status','draft','external_side_effect',false);
end;
$$;

create or replace function public.create_marketing_template_draft_v1(
  p_template_key text,
  p_name text,
  p_media_kind text,
  p_canvas_spec jsonb default '{}'::jsonb,
  p_layout_spec jsonb default '{}'::jsonb,
  p_brand_spec jsonb default '{}'::jsonb,
  p_variable_schema jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_key text:=lower(regexp_replace(trim(coalesce(p_template_key,'')),'[^a-zA-Z0-9_-]+','_','g'));
  v_version integer;
  v_id uuid;
begin
  if length(v_key)<2 or length(v_key)>100 then return jsonb_build_object('ok',false,'error','invalid_template_key','external_side_effect',false); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('ok',false,'error','name_required','external_side_effect',false); end if;
  if p_media_kind not in ('image','video','carousel') then return jsonb_build_object('ok',false,'error','invalid_media_kind','external_side_effect',false); end if;
  select coalesce(max(version),0)+1 into v_version from public.marketing_content_templates where template_key=v_key;
  insert into public.marketing_content_templates(template_key,version,name,media_kind,canvas_spec,layout_spec,brand_spec,variable_schema,created_by)
  values(v_key,v_version,trim(p_name),p_media_kind,coalesce(p_canvas_spec,'{}'::jsonb),coalesce(p_layout_spec,'{}'::jsonb),coalesce(p_brand_spec,'{}'::jsonb),coalesce(p_variable_schema,'{}'::jsonb),p_actor)
  returning id into v_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('template',v_id::text,'draft_created',p_actor,jsonb_build_object('template_key',v_key,'version',v_version));
  return jsonb_build_object('ok',true,'id',v_id,'template_key',v_key,'version',v_version,'status','draft','external_side_effect',false);
end;
$$;

create or replace function public.create_marketing_campaign_draft_v1(
  p_name text,
  p_objective text default null,
  p_content_policy jsonb default '{}'::jsonb,
  p_product_selection jsonb default '{}'::jsonb,
  p_schedule_rule jsonb default '{}'::jsonb,
  p_channel_plan jsonb default '{}'::jsonb,
  p_ai_policy jsonb default '{"mode":"optional","image":"optional","video":"optional"}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('ok',false,'error','name_required','external_side_effect',false); end if;
  insert into public.marketing_campaigns(name,objective,content_policy,product_selection,schedule_rule,channel_plan,ai_policy,created_by)
  values(trim(p_name),nullif(trim(coalesce(p_objective,'')),''),coalesce(p_content_policy,'{}'::jsonb),coalesce(p_product_selection,'{}'::jsonb),coalesce(p_schedule_rule,'{}'::jsonb),coalesce(p_channel_plan,'{}'::jsonb),coalesce(p_ai_policy,'{}'::jsonb),p_actor)
  returning id into v_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('campaign',v_id::text,'draft_created',p_actor,'{}'::jsonb);
  return jsonb_build_object('ok',true,'id',v_id,'status','draft','enabled',false,'execution_mode','off','kill_switch',true,'external_side_effect',false);
end;
$$;

create or replace function public.update_marketing_campaign_draft_v1(
  p_campaign_id uuid,
  p_name text default null,
  p_objective text default null,
  p_content_policy jsonb default null,
  p_product_selection jsonb default null,
  p_schedule_rule jsonb default null,
  p_channel_plan jsonb default null,
  p_ai_policy jsonb default null,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_row public.marketing_campaigns%rowtype;
begin
  select * into v_row from public.marketing_campaigns where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found','external_side_effect',false); end if;
  if v_row.status <> 'draft' or v_row.enabled or v_row.execution_mode <> 'off' then return jsonb_build_object('ok',false,'error','campaign_not_editable','external_side_effect',false); end if;
  update public.marketing_campaigns set
    name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),
    objective=case when p_objective is null then objective else nullif(trim(p_objective),'') end,
    content_policy=coalesce(p_content_policy,content_policy),
    product_selection=coalesce(p_product_selection,product_selection),
    schedule_rule=coalesce(p_schedule_rule,schedule_rule),
    channel_plan=coalesce(p_channel_plan,channel_plan),
    ai_policy=coalesce(p_ai_policy,ai_policy),
    updated_at=now()
  where id=p_campaign_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('campaign',p_campaign_id::text,'draft_updated',p_actor,'{}'::jsonb);
  return jsonb_build_object('ok',true,'id',p_campaign_id,'status','draft','external_side_effect',false);
end;
$$;

create or replace function public.create_marketing_asset_draft_v1(
  p_title text,
  p_media_kind text,
  p_generation_mode text,
  p_campaign_id uuid default null,
  p_template_id uuid default null,
  p_command_preset_id uuid default null,
  p_source_refs jsonb default '[]'::jsonb,
  p_edit_spec jsonb default '{}'::jsonb,
  p_render_spec jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_title,'')))<2 then return jsonb_build_object('ok',false,'error','title_required','external_side_effect',false); end if;
  if p_media_kind not in ('image','video','carousel') then return jsonb_build_object('ok',false,'error','invalid_media_kind','external_side_effect',false); end if;
  if p_generation_mode not in ('no_ai','ai','hybrid','manual') then return jsonb_build_object('ok',false,'error','invalid_generation_mode','external_side_effect',false); end if;
  insert into public.marketing_assets(campaign_id,title,media_kind,generation_mode,template_id,command_preset_id,source_refs,edit_spec,render_spec,created_by)
  values(p_campaign_id,trim(p_title),p_media_kind,p_generation_mode,p_template_id,p_command_preset_id,coalesce(p_source_refs,'[]'::jsonb),coalesce(p_edit_spec,'{}'::jsonb),coalesce(p_render_spec,'{}'::jsonb),p_actor)
  returning id into v_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('asset',v_id::text,'draft_created',p_actor,jsonb_build_object('generation_mode',p_generation_mode,'media_kind',p_media_kind));
  return jsonb_build_object('ok',true,'id',v_id,'status','draft','editable',true,'external_side_effect',false);
end;
$$;

create or replace function public.update_marketing_asset_draft_v1(
  p_asset_id uuid,
  p_title text default null,
  p_generation_mode text default null,
  p_template_id uuid default null,
  p_command_preset_id uuid default null,
  p_source_refs jsonb default null,
  p_edit_spec jsonb default null,
  p_render_spec jsonb default null,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_row public.marketing_assets%rowtype;
begin
  select * into v_row from public.marketing_assets where id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if v_row.status <> 'draft' or not v_row.editable then return jsonb_build_object('ok',false,'error','asset_not_editable','external_side_effect',false); end if;
  if p_generation_mode is not null and p_generation_mode not in ('no_ai','ai','hybrid','manual') then return jsonb_build_object('ok',false,'error','invalid_generation_mode','external_side_effect',false); end if;
  update public.marketing_assets set
    title=coalesce(nullif(trim(coalesce(p_title,'')),''),title),
    generation_mode=coalesce(p_generation_mode,generation_mode),
    template_id=coalesce(p_template_id,template_id),
    command_preset_id=coalesce(p_command_preset_id,command_preset_id),
    source_refs=coalesce(p_source_refs,source_refs),
    edit_spec=coalesce(p_edit_spec,edit_spec),
    render_spec=coalesce(p_render_spec,render_spec),
    updated_at=now()
  where id=p_asset_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('asset',p_asset_id::text,'draft_updated',p_actor,'{}'::jsonb);
  return jsonb_build_object('ok',true,'id',p_asset_id,'status','draft','external_side_effect',false);
end;
$$;

create or replace function public.create_marketing_publication_draft_v1(
  p_asset_id uuid,
  p_channel text,
  p_content_type text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default null,
  p_idempotency_key text default null,
  p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_asset public.marketing_assets%rowtype;
  v_id uuid;
  v_key text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_manual boolean:=true;
begin
  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false); end if;
  if p_channel not in ('whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post') then return jsonb_build_object('ok',false,'error','invalid_channel','external_side_effect',false); end if;
  if p_content_type not in ('image','video','carousel','post') then return jsonb_build_object('ok',false,'error','invalid_content_type','external_side_effect',false); end if;
  if v_key is null then v_key:='draft:'||p_asset_id::text||':'||p_channel||':'||extract(epoch from clock_timestamp())::bigint::text; end if;
  v_manual := p_channel='whatsapp_status';
  insert into public.marketing_publication_jobs(campaign_id,asset_id,channel,content_type,status,manual_confirmation_required,scheduled_for,payload,idempotency_key,created_by)
  values(v_asset.campaign_id,p_asset_id,p_channel,p_content_type,'draft',v_manual,p_scheduled_for,coalesce(p_payload,'{}'::jsonb),v_key,p_actor)
  returning id into v_id;
  insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data) values('publication_job',v_id::text,'draft_created',p_actor,jsonb_build_object('channel',p_channel,'manual_confirmation_required',v_manual));
  return jsonb_build_object('ok',true,'id',v_id,'status','draft','manual_confirmation_required',v_manual,'external_side_effect',false);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','duplicate_idempotency_key','external_side_effect',false);
end;
$$;

create or replace function public.kill_marketing_runtime_v1(p_reason text default null,p_actor uuid default null)
returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
begin
  update public.marketing_runtime_config set
    enabled=false,execution_mode='off',canary_percent=0,kill_switch=true,
    generation_enabled=false,deterministic_render_enabled=false,ai_image_enabled=false,ai_video_enabled=false,
    publishing_enabled=false,whatsapp_status_publish_enabled=false,instagram_story_publish_enabled=false,
    facebook_story_publish_enabled=false,instagram_carousel_publish_enabled=false,pinterest_publish_enabled=false,
    google_business_publish_enabled=false,max_daily_publications=0,max_daily_ai_image_generations=0,
    max_daily_ai_video_seconds=0,max_daily_ai_cost_cents=0,updated_at=now(),updated_by=p_actor
  where id=1;
  update public.marketing_campaigns set enabled=false,execution_mode='off',canary_percent=0,kill_switch=true,updated_at=now()
  where enabled or execution_mode<>'off' or canary_percent<>0 or not kill_switch;
  insert into public.marketing_events(entity_type,event_type,actor_id,data) values('runtime','kill_switch',p_actor,jsonb_build_object('reason',nullif(trim(coalesce(p_reason,'')),'')));
  return jsonb_build_object('ok',true,'enabled',false,'execution_mode','off','kill_switch',true,'external_side_effect',false);
end;
$$;

create or replace function public.marketing_admin_snapshot_v1()
returns jsonb
language sql
security invoker
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'readiness', public.marketing_readiness_v1(),
    'commands', coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,command_key,version,name,media_kind,generation_mode,provider_hint,status,created_at from public.marketing_command_presets order by created_at desc limit 80) x),'[]'::jsonb),
    'templates', coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,template_key,version,name,media_kind,status,created_at from public.marketing_content_templates order by created_at desc limit 80) x),'[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(x order by x.updated_at desc) from (select id,name,objective,status,enabled,execution_mode,canary_percent,kill_switch,content_policy,product_selection,schedule_rule,channel_plan,ai_policy,max_cost_cents,max_publications_per_day,created_at,updated_at from public.marketing_campaigns order by updated_at desc limit 80) x),'[]'::jsonb),
    'assets', coalesce((select jsonb_agg(x order by x.updated_at desc) from (select id,campaign_id,title,media_kind,generation_mode,status,template_id,command_preset_id,edit_spec,render_spec,output_spec,editable,estimated_cost_cents,actual_cost_cents,created_at,updated_at from public.marketing_assets order by updated_at desc limit 100) x),'[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,campaign_id,asset_id,channel,content_type,status,manual_confirmation_required,scheduled_for,idempotency_key,external_ref,attempt_count,last_error,estimated_cost_cents,published_at,created_at,updated_at from public.marketing_publication_jobs order by created_at desc limit 120) x),'[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(x order by x.channel,x.display_name) from (select id,channel,provider,display_name,external_account_id,status,capabilities,last_verified_at,token_expires_at,updated_at from public.marketing_channel_accounts order by channel,display_name limit 50) x),'[]'::jsonb),
    'external_side_effect', false
  )
$$;

revoke all on function public.marketing_readiness_v1() from public,anon,authenticated;
revoke all on function public.create_marketing_command_draft_v1(text,text,text,text,text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.create_marketing_template_draft_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.create_marketing_campaign_draft_v1(text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.update_marketing_campaign_draft_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.create_marketing_asset_draft_v1(text,text,text,uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.update_marketing_asset_draft_v1(uuid,text,text,uuid,uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.create_marketing_publication_draft_v1(uuid,text,text,jsonb,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.kill_marketing_runtime_v1(text,uuid) from public,anon,authenticated;
revoke all on function public.marketing_admin_snapshot_v1() from public,anon,authenticated;

grant execute on function public.marketing_readiness_v1() to service_role;
grant execute on function public.create_marketing_command_draft_v1(text,text,text,text,text,text,text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.create_marketing_template_draft_v1(text,text,text,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.create_marketing_campaign_draft_v1(text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.update_marketing_campaign_draft_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.create_marketing_asset_draft_v1(text,text,text,uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.update_marketing_asset_draft_v1(uuid,text,text,uuid,uuid,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.create_marketing_publication_draft_v1(uuid,text,text,jsonb,timestamptz,text,uuid) to service_role;
grant execute on function public.kill_marketing_runtime_v1(text,uuid) to service_role;
grant execute on function public.marketing_admin_snapshot_v1() to service_role;

commit;
