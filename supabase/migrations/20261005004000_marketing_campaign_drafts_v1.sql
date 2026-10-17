begin;

create table if not exists public.marketing_campaigns_v1 (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  template_id uuid not null references public.whatsapp_templates_v1(id),
  status text not null default 'draft' check (status in ('draft','ready_for_review','approved','cancelled')),
  revision integer not null default 1 check (revision >= 1),
  filters jsonb not null default '{}'::jsonb,
  variable_values jsonb not null default '{}'::jsonb,
  deep_link jsonb not null default '{}'::jsonb,
  notes text,
  idempotency_key text,
  template_name_snapshot text,
  template_language_snapshot text,
  template_category_snapshot text,
  template_components_snapshot jsonb,
  ready_for_review_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists marketing_campaigns_v1_idempotency_uidx
  on public.marketing_campaigns_v1(idempotency_key)
  where idempotency_key is not null;
create index if not exists marketing_campaigns_v1_status_idx on public.marketing_campaigns_v1(status,updated_at desc);
create index if not exists marketing_campaigns_v1_account_idx on public.marketing_campaigns_v1(whatsapp_account_id,updated_at desc);

create table if not exists public.marketing_campaign_snapshots_v1 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns_v1(id),
  campaign_revision integer not null,
  snapshot_version integer not null check (snapshot_version >= 1),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  template_id uuid not null references public.whatsapp_templates_v1(id),
  template_name text not null,
  template_language text not null,
  template_category text not null,
  template_components jsonb not null default '[]'::jsonb,
  filters_snapshot jsonb not null default '{}'::jsonb,
  variable_values_snapshot jsonb not null default '{}'::jsonb,
  deep_link_snapshot jsonb not null default '{}'::jsonb,
  found_count integer not null default 0,
  eligible_count integer not null default 0,
  excluded_count integer not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (campaign_id,campaign_revision),
  unique (campaign_id,snapshot_version)
);

create table if not exists public.marketing_campaign_snapshot_recipients_v1 (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.marketing_campaign_snapshots_v1(id),
  campaign_id uuid not null references public.marketing_campaigns_v1(id),
  customer_id uuid not null references public.customers(id),
  phone_e164 text,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  eligible_at_snapshot boolean not null,
  exclusion_reasons text[] not null default '{}'::text[],
  phone_rank bigint not null,
  city text,
  neighborhood text,
  order_count integer not null default 0,
  lifetime_value numeric not null default 0,
  last_purchase_at timestamptz,
  segment_evidence jsonb not null default '{}'::jsonb,
  parameter_source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (snapshot_id,customer_id)
);

create index if not exists marketing_campaign_snapshot_recipients_v1_snapshot_idx
  on public.marketing_campaign_snapshot_recipients_v1(snapshot_id,eligible_at_snapshot,customer_id);
create index if not exists marketing_campaign_snapshot_recipients_v1_phone_idx
  on public.marketing_campaign_snapshot_recipients_v1(snapshot_id,phone_e164);

create table if not exists public.marketing_campaign_events_v1 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns_v1(id),
  event_type text not null,
  campaign_revision integer not null,
  snapshot_id uuid references public.marketing_campaign_snapshots_v1(id),
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketing_campaign_events_v1_campaign_idx
  on public.marketing_campaign_events_v1(campaign_id,created_at,id);

create or replace function public.marketing_campaign_append_only_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception using errcode='55000', message='immutable_append_only';
end;
$$;

revoke all on function public.marketing_campaign_append_only_guard_v1() from public, anon, authenticated;
grant execute on function public.marketing_campaign_append_only_guard_v1() to service_role;

drop trigger if exists marketing_campaign_snapshots_v1_append_only on public.marketing_campaign_snapshots_v1;
create trigger marketing_campaign_snapshots_v1_append_only
before update or delete on public.marketing_campaign_snapshots_v1
for each row execute function public.marketing_campaign_append_only_guard_v1();

drop trigger if exists marketing_campaign_snapshot_recipients_v1_append_only on public.marketing_campaign_snapshot_recipients_v1;
create trigger marketing_campaign_snapshot_recipients_v1_append_only
before update or delete on public.marketing_campaign_snapshot_recipients_v1
for each row execute function public.marketing_campaign_append_only_guard_v1();

drop trigger if exists marketing_campaign_events_v1_append_only on public.marketing_campaign_events_v1;
create trigger marketing_campaign_events_v1_append_only
before update or delete on public.marketing_campaign_events_v1
for each row execute function public.marketing_campaign_append_only_guard_v1();

alter table public.marketing_campaigns_v1 enable row level security;
alter table public.marketing_campaign_snapshots_v1 enable row level security;
alter table public.marketing_campaign_snapshot_recipients_v1 enable row level security;
alter table public.marketing_campaign_events_v1 enable row level security;

revoke all on table public.marketing_campaigns_v1 from public, anon, authenticated;
revoke all on table public.marketing_campaign_snapshots_v1 from public, anon, authenticated;
revoke all on table public.marketing_campaign_snapshot_recipients_v1 from public, anon, authenticated;
revoke all on table public.marketing_campaign_events_v1 from public, anon, authenticated;
grant select,insert,update,delete on table public.marketing_campaigns_v1 to service_role;
grant select,insert on table public.marketing_campaign_snapshots_v1 to service_role;
grant select,insert on table public.marketing_campaign_snapshot_recipients_v1 to service_role;
grant select,insert on table public.marketing_campaign_events_v1 to service_role;

create or replace function public.marketing_campaign_template_snapshot_v1(
  p_whatsapp_account_id uuid,
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template jsonb;
begin
  if not exists (
    select 1 from public.whatsapp_accounts a
    where a.id=p_whatsapp_account_id and coalesce(a.is_active,false) is true
  ) or not exists (
    select 1 from public.whatsapp_channel_runtime_v1 r
    where r.whatsapp_account_id=p_whatsapp_account_id
  ) then
    return jsonb_build_object('ok',false,'error','account_not_available');
  end if;

  select jsonb_build_object(
    'ok',true,
    'id',s.id,
    'name',s.name,
    'language',s.language,
    'category',s.category,
    'status',s.status,
    'components',coalesce(s.components,'[]'::jsonb)
  ) into v_template
  from (
    select t.id,t.name,t.language,t.category,t.status,t.components
    from public.whatsapp_templates_v1 t
    where t.id=p_template_id
      and t.whatsapp_account_id=p_whatsapp_account_id
  ) s
  where upper(category)='MARKETING'
    and upper(status)='APPROVED';

  if v_template is null then
    return jsonb_build_object('ok',false,'error','template_not_sendable');
  end if;
  return v_template;
end;
$$;

revoke all on function public.marketing_campaign_template_snapshot_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.marketing_campaign_template_snapshot_v1(uuid,uuid) to service_role;

create or replace function public.marketing_create_campaign_v1(
  p_name text,
  p_whatsapp_account_id uuid,
  p_template_id uuid,
  p_filters jsonb,
  p_variable_values jsonb default '{}'::jsonb,
  p_deep_link jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template jsonb;
  v_campaign public.marketing_campaigns_v1%rowtype;
begin
  if nullif(btrim(coalesce(p_name,'')),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_name');
  end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_variable_values,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_deep_link,'{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok',false,'error','invalid_payload');
  end if;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_campaign from public.marketing_campaigns_v1 c
    where c.idempotency_key=btrim(p_idempotency_key) limit 1;
    if found then
      return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status',v_campaign.status,'idempotent',true);
    end if;
  end if;

  v_template := public.marketing_campaign_template_snapshot_v1(p_whatsapp_account_id,p_template_id);
  if coalesce((v_template->>'ok')::boolean,false) is not true then return v_template; end if;

  begin
    perform * from public.marketing_audience_candidates_v2(coalesce(p_filters,'{}'::jsonb)) limit 1;
  exception when others then
    return jsonb_build_object('ok',false,'error','invalid_filters','detail',sqlerrm);
  end;

  insert into public.marketing_campaigns_v1(
    name,whatsapp_account_id,template_id,filters,variable_values,deep_link,idempotency_key,
    template_name_snapshot,template_language_snapshot,template_category_snapshot,template_components_snapshot
  ) values (
    btrim(p_name),p_whatsapp_account_id,p_template_id,coalesce(p_filters,'{}'::jsonb),
    coalesce(p_variable_values,'{}'::jsonb),coalesce(p_deep_link,'{}'::jsonb),nullif(btrim(coalesce(p_idempotency_key,'')),''),
    v_template->>'name',v_template->>'language',v_template->>'category',coalesce(v_template->'components','[]'::jsonb)
  ) returning * into v_campaign;

  insert into public.marketing_campaign_events_v1(campaign_id,event_type,campaign_revision,to_status,metadata)
  values(v_campaign.id,'created',v_campaign.revision,v_campaign.status,jsonb_build_object('template_id',p_template_id));

  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status',v_campaign.status,'idempotent',false);
exception when unique_violation then
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_campaign from public.marketing_campaigns_v1 c where c.idempotency_key=btrim(p_idempotency_key) limit 1;
    if found then return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status',v_campaign.status,'idempotent',true); end if;
  end if;
  raise;
end;
$$;

revoke all on function public.marketing_create_campaign_v1(text,uuid,uuid,jsonb,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.marketing_create_campaign_v1(text,uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;

create or replace function public.marketing_update_campaign_draft_v1(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_unsupported text;
  v_name text;
  v_account uuid;
  v_template_id uuid;
  v_filters jsonb;
  v_variables jsonb;
  v_deep_link jsonb;
  v_notes text;
  v_semantic_changed boolean;
  v_template jsonb;
begin
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object' then return jsonb_build_object('ok',false,'error','invalid_patch'); end if;
  select k into v_unsupported from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) k
  where k <> all(array['name','whatsapp_account_id','template_id','filters','variable_values','deep_link','notes']::text[]) limit 1;
  if v_unsupported is not null then return jsonb_build_object('ok',false,'error','unsupported_patch','field',v_unsupported); end if;

  select * into v_campaign from public.marketing_campaigns_v1 c where c.id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.revision <> p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.status <> 'draft' then return jsonb_build_object('ok',false,'error','campaign_not_draft'); end if;

  begin
    v_name := case when p_patch ? 'name' then nullif(btrim(p_patch->>'name'),'') else v_campaign.name end;
    v_account := case when p_patch ? 'whatsapp_account_id' then (p_patch->>'whatsapp_account_id')::uuid else v_campaign.whatsapp_account_id end;
    v_template_id := case when p_patch ? 'template_id' then (p_patch->>'template_id')::uuid else v_campaign.template_id end;
  exception when others then return jsonb_build_object('ok',false,'error','invalid_patch'); end;
  if v_name is null then return jsonb_build_object('ok',false,'error','invalid_name'); end if;
  v_filters := case when p_patch ? 'filters' then p_patch->'filters' else v_campaign.filters end;
  v_variables := case when p_patch ? 'variable_values' then p_patch->'variable_values' else v_campaign.variable_values end;
  v_deep_link := case when p_patch ? 'deep_link' then p_patch->'deep_link' else v_campaign.deep_link end;
  v_notes := case when p_patch ? 'notes' then p_patch->>'notes' else v_campaign.notes end;
  if jsonb_typeof(coalesce(v_filters,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(v_variables,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(v_deep_link,'{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok',false,'error','invalid_patch');
  end if;

  v_semantic_changed := v_account is distinct from v_campaign.whatsapp_account_id
    or v_template_id is distinct from v_campaign.template_id
    or v_filters is distinct from v_campaign.filters
    or v_variables is distinct from v_campaign.variable_values
    or v_deep_link is distinct from v_campaign.deep_link;

  if v_semantic_changed then
    v_template := public.marketing_campaign_template_snapshot_v1(v_account,v_template_id);
    if coalesce((v_template->>'ok')::boolean,false) is not true then return v_template; end if;
    begin perform * from public.marketing_audience_candidates_v2(v_filters) limit 1;
    exception when others then return jsonb_build_object('ok',false,'error','invalid_filters','detail',sqlerrm); end;
  else
    v_template := jsonb_build_object('name',v_campaign.template_name_snapshot,'language',v_campaign.template_language_snapshot,'category',v_campaign.template_category_snapshot,'components',v_campaign.template_components_snapshot);
  end if;

  update public.marketing_campaigns_v1 c set
    name=v_name,
    whatsapp_account_id=v_account,
    template_id=v_template_id,
    filters=v_filters,
    variable_values=v_variables,
    deep_link=v_deep_link,
    notes=v_notes,
    revision=case when v_semantic_changed then c.revision+1 else c.revision end,
    template_name_snapshot=coalesce(v_template->>'name',c.template_name_snapshot),
    template_language_snapshot=coalesce(v_template->>'language',c.template_language_snapshot),
    template_category_snapshot=coalesce(v_template->>'category',c.template_category_snapshot),
    template_components_snapshot=coalesce(v_template->'components',c.template_components_snapshot),
    updated_at=now()
  where c.id=p_campaign_id
  returning * into v_campaign;

  insert into public.marketing_campaign_events_v1(campaign_id,event_type,campaign_revision,from_status,to_status,metadata)
  values(v_campaign.id,'draft_updated',v_campaign.revision,'draft','draft',jsonb_build_object('semantic_changed',v_semantic_changed));

  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status',v_campaign.status,'semantic_changed',v_semantic_changed);
end;
$$;

revoke all on function public.marketing_update_campaign_draft_v1(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.marketing_update_campaign_draft_v1(uuid,integer,jsonb) to service_role;

create or replace function public.marketing_create_campaign_snapshot_v1(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_existing public.marketing_campaign_snapshots_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template jsonb;
  v_version integer;
  v_found integer;
  v_eligible integer;
begin
  select * into v_campaign from public.marketing_campaigns_v1 c where c.id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.revision <> p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.status not in ('draft','ready_for_review') then return jsonb_build_object('ok',false,'error','campaign_invalid_transition'); end if;

  select * into v_existing from public.marketing_campaign_snapshots_v1 s
  where s.campaign_id=p_campaign_id and s.campaign_revision=v_campaign.revision limit 1;
  if found then
    return jsonb_build_object('ok',true,'snapshot_id',v_existing.id,'campaign_id',p_campaign_id,'revision',v_existing.campaign_revision,'snapshot_version',v_existing.snapshot_version,'found_count',v_existing.found_count,'eligible_count',v_existing.eligible_count,'excluded_count',v_existing.excluded_count,'idempotent',true);
  end if;

  v_template := public.marketing_campaign_template_snapshot_v1(v_campaign.whatsapp_account_id,v_campaign.template_id);
  if coalesce((v_template->>'ok')::boolean,false) is not true then return v_template; end if;

  select coalesce(max(s.snapshot_version),0)+1 into v_version from public.marketing_campaign_snapshots_v1 s where s.campaign_id=p_campaign_id;
  select count(*)::integer,count(*) filter(where a.eligible)::integer into v_found,v_eligible
  from public.marketing_audience_candidates_v2(v_campaign.filters) a;

  insert into public.marketing_campaign_snapshots_v1(
    campaign_id,campaign_revision,snapshot_version,whatsapp_account_id,template_id,
    template_name,template_language,template_category,template_components,
    filters_snapshot,variable_values_snapshot,deep_link_snapshot,
    found_count,eligible_count,excluded_count,idempotency_key
  ) values (
    v_campaign.id,v_campaign.revision,v_version,v_campaign.whatsapp_account_id,v_campaign.template_id,
    v_template->>'name',v_template->>'language',v_template->>'category',coalesce(v_template->'components','[]'::jsonb),
    v_campaign.filters,v_campaign.variable_values,v_campaign.deep_link,
    coalesce(v_found,0),coalesce(v_eligible,0),coalesce(v_found,0)-coalesce(v_eligible,0),nullif(btrim(coalesce(p_idempotency_key,'')),'')
  ) returning * into v_snapshot;

  insert into public.marketing_campaign_snapshot_recipients_v1(
    snapshot_id,campaign_id,customer_id,phone_e164,whatsapp_account_id,eligible_at_snapshot,
    exclusion_reasons,phone_rank,city,neighborhood,order_count,lifetime_value,last_purchase_at,
    segment_evidence,parameter_source_metadata
  )
  select v_snapshot.id,v_campaign.id,a.customer_id,a.canonical_phone,v_campaign.whatsapp_account_id,a.eligible,
         coalesce(a.exclusion_reason_list,'{}'::text[]),a.phone_rank,a.city,a.neighborhood,a.order_count,a.lifetime_value,a.last_purchase_at,
         jsonb_build_object('city',a.city,'neighborhood',a.neighborhood,'order_count',a.order_count,'lifetime_value',a.lifetime_value,'last_purchase_at',a.last_purchase_at),
         jsonb_build_object('variable_values',v_campaign.variable_values,'deep_link',v_campaign.deep_link)
  from public.marketing_audience_candidates_v2(v_campaign.filters) a;

  insert into public.marketing_campaign_events_v1(campaign_id,event_type,campaign_revision,snapshot_id,from_status,to_status,metadata)
  values(v_campaign.id,'snapshot_created',v_campaign.revision,v_snapshot.id,v_campaign.status,v_campaign.status,jsonb_build_object('snapshot_version',v_snapshot.snapshot_version,'found_count',v_snapshot.found_count,'eligible_count',v_snapshot.eligible_count));

  return jsonb_build_object('ok',true,'snapshot_id',v_snapshot.id,'campaign_id',p_campaign_id,'revision',v_snapshot.campaign_revision,'snapshot_version',v_snapshot.snapshot_version,'found_count',v_snapshot.found_count,'eligible_count',v_snapshot.eligible_count,'excluded_count',v_snapshot.excluded_count,'idempotent',false);
exception when unique_violation then
  select * into v_existing from public.marketing_campaign_snapshots_v1 s where s.campaign_id=p_campaign_id and s.campaign_revision=p_expected_revision limit 1;
  if found then return jsonb_build_object('ok',true,'snapshot_id',v_existing.id,'campaign_id',p_campaign_id,'revision',v_existing.campaign_revision,'snapshot_version',v_existing.snapshot_version,'found_count',v_existing.found_count,'eligible_count',v_existing.eligible_count,'excluded_count',v_existing.excluded_count,'idempotent',true); end if;
  raise;
end;
$$;

revoke all on function public.marketing_create_campaign_snapshot_v1(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.marketing_create_campaign_snapshot_v1(uuid,integer,text) to service_role;

create or replace function public.marketing_transition_campaign_v1(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_to_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template jsonb;
  v_from text;
  v_to text := lower(btrim(coalesce(p_to_status,'')));
begin
  select * into v_campaign from public.marketing_campaigns_v1 c where c.id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.revision <> p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  v_from := v_campaign.status;

  if v_from='draft' and v_to='ready_for_review' then
    select * into v_snapshot from public.marketing_campaign_snapshots_v1 s where s.campaign_id=v_campaign.id and s.campaign_revision=v_campaign.revision limit 1;
    if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
    v_template := public.marketing_campaign_template_snapshot_v1(v_campaign.whatsapp_account_id,v_campaign.template_id);
    if coalesce((v_template->>'ok')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  elsif v_from='ready_for_review' and v_to='draft' then
    null;
  elsif v_from='ready_for_review' and v_to='approved' then
    select * into v_snapshot from public.marketing_campaign_snapshots_v1 s where s.campaign_id=v_campaign.id and s.campaign_revision=v_campaign.revision limit 1;
    if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
    v_template := public.marketing_campaign_template_snapshot_v1(v_campaign.whatsapp_account_id,v_campaign.template_id);
    if coalesce((v_template->>'ok')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  elsif v_to='cancelled' and v_from in ('draft','ready_for_review','approved') then
    null;
  else
    return jsonb_build_object('ok',false,'error','campaign_invalid_transition','from_status',v_from,'to_status',v_to);
  end if;

  update public.marketing_campaigns_v1 c set
    status=v_to,
    ready_for_review_at=case when v_to='ready_for_review' then now() when v_to='draft' then null else c.ready_for_review_at end,
    approved_at=case when v_to='approved' then now() else c.approved_at end,
    cancelled_at=case when v_to='cancelled' then now() else c.cancelled_at end,
    updated_at=now()
  where c.id=p_campaign_id returning * into v_campaign;

  insert into public.marketing_campaign_events_v1(campaign_id,event_type,campaign_revision,snapshot_id,from_status,to_status,reason)
  values(v_campaign.id,'status_changed',v_campaign.revision,v_snapshot.id,v_from,v_to,nullif(btrim(coalesce(p_reason,'')),''));

  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,'status',v_campaign.status,'from_status',v_from);
end;
$$;

revoke all on function public.marketing_transition_campaign_v1(uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.marketing_transition_campaign_v1(uuid,integer,text,text) to service_role;

create or replace function public.marketing_campaign_detail_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot jsonb;
begin
  select * into v_campaign from public.marketing_campaigns_v1 c where c.id=p_campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select jsonb_build_object(
    'id',s.id,'campaign_revision',s.campaign_revision,'snapshot_version',s.snapshot_version,
    'found_count',s.found_count,'eligible_count',s.eligible_count,'excluded_count',s.excluded_count,'created_at',s.created_at
  ) into v_snapshot
  from public.marketing_campaign_snapshots_v1 s
  where s.campaign_id=v_campaign.id and s.campaign_revision=v_campaign.revision
  order by s.snapshot_version desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'campaign',jsonb_build_object(
      'id',v_campaign.id,'name',v_campaign.name,'whatsapp_account_id',v_campaign.whatsapp_account_id,
      'template_id',v_campaign.template_id,'status',v_campaign.status,'revision',v_campaign.revision,
      'filters',v_campaign.filters,'variable_values',v_campaign.variable_values,'deep_link',v_campaign.deep_link,
      'notes',v_campaign.notes,'template_name',v_campaign.template_name_snapshot,'template_language',v_campaign.template_language_snapshot,
      'template_category',v_campaign.template_category_snapshot,'template_components',v_campaign.template_components_snapshot,
      'created_at',v_campaign.created_at,'updated_at',v_campaign.updated_at
    ),
    'snapshot',v_snapshot
  );
end;
$$;

revoke all on function public.marketing_campaign_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_campaign_detail_v1(uuid) to service_role;

commit;
