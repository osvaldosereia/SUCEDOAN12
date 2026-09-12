begin;

-- Marketing attribution V10 — deterministic, append-only and dormant by default.
-- No provider call, tracking pixel, social API call or inferred attribution is performed here.

alter table public.marketing_runtime_config
  add column if not exists attribution_recording_enabled boolean not null default false;

create table if not exists public.marketing_attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketing_assets(id) on delete restrict,
  campaign_id uuid references public.marketing_campaigns(id) on delete restrict,
  channel text not null check (channel in ('whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post')),
  touchpoint_type text not null check (touchpoint_type in ('click','conversation','order')),
  subject_ref text not null check (length(subject_ref) between 1 and 200),
  parent_touchpoint_id uuid references public.marketing_attribution_touchpoints(id) on delete restrict,
  evidence_key text not null unique check (length(evidence_key) between 8 and 200),
  evidence_source text not null check (evidence_source in ('internal_link','whatsapp_conversation','order_system','manual_verified_import')),
  occurred_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'object')
);

create index if not exists marketing_attribution_asset_time_idx
  on public.marketing_attribution_touchpoints(asset_id, occurred_at desc);
create index if not exists marketing_attribution_campaign_time_idx
  on public.marketing_attribution_touchpoints(campaign_id, occurred_at desc)
  where campaign_id is not null;
create index if not exists marketing_attribution_parent_idx
  on public.marketing_attribution_touchpoints(parent_touchpoint_id)
  where parent_touchpoint_id is not null;
create index if not exists marketing_attribution_type_time_idx
  on public.marketing_attribution_touchpoints(touchpoint_type, occurred_at desc);

alter table public.marketing_attribution_touchpoints enable row level security;
revoke all on table public.marketing_attribution_touchpoints from public, anon, authenticated;
grant select, insert on table public.marketing_attribution_touchpoints to service_role;

create or replace function public.marketing_attribution_append_only_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  raise exception 'marketing_attribution_touchpoints_append_only';
end;
$$;

revoke all on function public.marketing_attribution_append_only_guard_v1() from public, anon, authenticated;
grant execute on function public.marketing_attribution_append_only_guard_v1() to service_role;

drop trigger if exists marketing_attribution_touchpoints_append_only on public.marketing_attribution_touchpoints;
create trigger marketing_attribution_touchpoints_append_only
before update or delete on public.marketing_attribution_touchpoints
for each row execute function public.marketing_attribution_append_only_guard_v1();

create or replace function public.record_marketing_attribution_touchpoint_v1(
  p_asset_id uuid,
  p_channel text,
  p_touchpoint_type text,
  p_subject_ref text,
  p_evidence_key text,
  p_evidence_source text,
  p_parent_touchpoint_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_evidence jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_cfg public.marketing_runtime_config%rowtype;
  v_asset public.marketing_assets%rowtype;
  v_parent public.marketing_attribution_touchpoints%rowtype;
  v_existing public.marketing_attribution_touchpoints%rowtype;
  v_id uuid;
  v_inserted boolean:=false;
  v_subject_ref text:=trim(coalesce(p_subject_ref,''));
  v_evidence_key text:=trim(coalesce(p_evidence_key,''));
  v_now timestamptz:=now();
begin
  select * into v_cfg from public.marketing_runtime_config where id=1;
  if not found then
    return jsonb_build_object('ok',false,'error','marketing_runtime_missing','external_side_effect',false);
  end if;
  if v_cfg.kill_switch or not v_cfg.enabled or v_cfg.execution_mode='off' or not v_cfg.attribution_recording_enabled then
    return jsonb_build_object('ok',false,'error','marketing_attribution_recording_disabled','external_side_effect',false);
  end if;

  if p_channel not in ('whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post') then
    return jsonb_build_object('ok',false,'error','invalid_channel','external_side_effect',false);
  end if;
  if p_touchpoint_type not in ('click','conversation','order') then
    return jsonb_build_object('ok',false,'error','invalid_touchpoint_type','external_side_effect',false);
  end if;
  if length(v_subject_ref) < 1 or length(v_subject_ref) > 200 then
    return jsonb_build_object('ok',false,'error','invalid_subject_ref','external_side_effect',false);
  end if;
  if length(v_evidence_key) < 8 or length(v_evidence_key) > 200 then
    return jsonb_build_object('ok',false,'error','invalid_evidence_key','external_side_effect',false);
  end if;
  if p_evidence_source not in ('internal_link','whatsapp_conversation','order_system','manual_verified_import') then
    return jsonb_build_object('ok',false,'error','invalid_evidence_source','external_side_effect',false);
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    return jsonb_build_object('ok',false,'error','invalid_evidence','external_side_effect',false);
  end if;
  if p_occurred_at is null or p_occurred_at > v_now + interval '5 minutes' or p_occurred_at < v_now - interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_occurred_at','external_side_effect',false);
  end if;

  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then
    return jsonb_build_object('ok',false,'error','asset_not_found','external_side_effect',false);
  end if;

  if p_touchpoint_type='click' and p_parent_touchpoint_id is not null then
    return jsonb_build_object('ok',false,'error','click_parent_not_allowed','external_side_effect',false);
  end if;

  if p_touchpoint_type in ('conversation','order') then
    if p_parent_touchpoint_id is null then
      return jsonb_build_object('ok',false,'error','parent_touchpoint_required','external_side_effect',false);
    end if;
    select * into v_parent from public.marketing_attribution_touchpoints where id=p_parent_touchpoint_id;
    if not found then
      return jsonb_build_object('ok',false,'error','parent_touchpoint_not_found','external_side_effect',false);
    end if;
    if v_parent.asset_id<>p_asset_id or v_parent.channel<>p_channel then
      return jsonb_build_object('ok',false,'error','parent_scope_mismatch','external_side_effect',false);
    end if;
    if p_touchpoint_type='conversation' and v_parent.touchpoint_type<>'click' then
      return jsonb_build_object('ok',false,'error','conversation_parent_must_be_click','external_side_effect',false);
    end if;
    if p_touchpoint_type='order' and v_parent.touchpoint_type not in ('click','conversation') then
      return jsonb_build_object('ok',false,'error','order_parent_invalid','external_side_effect',false);
    end if;
    if p_occurred_at < v_parent.occurred_at then
      return jsonb_build_object('ok',false,'error','touchpoint_time_before_parent','external_side_effect',false);
    end if;
  end if;

  select * into v_existing from public.marketing_attribution_touchpoints where evidence_key=v_evidence_key;
  if found then
    if v_existing.asset_id=p_asset_id
       and v_existing.channel=p_channel
       and v_existing.touchpoint_type=p_touchpoint_type
       and v_existing.subject_ref=v_subject_ref
       and v_existing.evidence_source=p_evidence_source
       and v_existing.parent_touchpoint_id is not distinct from p_parent_touchpoint_id
       and v_existing.occurred_at=p_occurred_at then
      return jsonb_build_object('ok',true,'id',v_existing.id,'idempotent',true,'touchpoint_type',v_existing.touchpoint_type,'external_side_effect',false);
    end if;
    return jsonb_build_object('ok',false,'error','idempotency_conflict','external_side_effect',false);
  end if;

  insert into public.marketing_attribution_touchpoints(
    asset_id,campaign_id,channel,touchpoint_type,subject_ref,parent_touchpoint_id,evidence_key,evidence_source,occurred_at,evidence,created_by
  ) values(
    p_asset_id,v_asset.campaign_id,p_channel,p_touchpoint_type,v_subject_ref,p_parent_touchpoint_id,v_evidence_key,p_evidence_source,p_occurred_at,p_evidence,p_actor
  ) returning id into v_id;
  v_inserted:=true;

  if v_inserted then
    insert into public.marketing_events(entity_type,entity_id,event_type,actor_id,data,external_side_effect)
    values('attribution_touchpoint',v_id::text,'recorded',p_actor,
      jsonb_build_object('asset_id',p_asset_id,'campaign_id',v_asset.campaign_id,'channel',p_channel,'touchpoint_type',p_touchpoint_type,'evidence_source',p_evidence_source),false);
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'idempotent',false,'touchpoint_type',p_touchpoint_type,'external_side_effect',false);
exception
  when unique_violation then
    select * into v_existing from public.marketing_attribution_touchpoints where evidence_key=v_evidence_key;
    if found and v_existing.asset_id=p_asset_id and v_existing.channel=p_channel and v_existing.touchpoint_type=p_touchpoint_type
       and v_existing.subject_ref=v_subject_ref and v_existing.evidence_source=p_evidence_source
       and v_existing.parent_touchpoint_id is not distinct from p_parent_touchpoint_id and v_existing.occurred_at=p_occurred_at then
      return jsonb_build_object('ok',true,'id',v_existing.id,'idempotent',true,'touchpoint_type',v_existing.touchpoint_type,'external_side_effect',false);
    end if;
    return jsonb_build_object('ok',false,'error','idempotency_conflict','external_side_effect',false);
end;
$$;

revoke all on function public.record_marketing_attribution_touchpoint_v1(uuid,text,text,text,text,text,uuid,timestamptz,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.record_marketing_attribution_touchpoint_v1(uuid,text,text,text,text,text,uuid,timestamptz,jsonb,uuid) to service_role;

create or replace function public.marketing_attribution_read_model_v1(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_attribution_window','external_side_effect',false);
  end if;
  return jsonb_build_object(
    'ok',true,
    'status','deterministic_evidence_only',
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'touchpoints',jsonb_build_object(
      'total',(select count(*) from public.marketing_attribution_touchpoints where occurred_at>=v_from and occurred_at<v_to),
      'clicks',(select count(*) from public.marketing_attribution_touchpoints where touchpoint_type='click' and occurred_at>=v_from and occurred_at<v_to),
      'conversations',(select count(*) from public.marketing_attribution_touchpoints where touchpoint_type='conversation' and occurred_at>=v_from and occurred_at<v_to),
      'orders',(select count(*) from public.marketing_attribution_touchpoints where touchpoint_type='order' and occurred_at>=v_from and occurred_at<v_to),
      'by_channel',coalesce((select jsonb_object_agg(channel,cnt) from (select channel,count(*) cnt from public.marketing_attribution_touchpoints where occurred_at>=v_from and occurred_at<v_to group by channel) q),'{}'::jsonb)
    ),
    'rules',jsonb_build_object(
      'inferred_attribution',false,
      'conversation_requires_click_parent',true,
      'order_requires_click_or_conversation_parent',true,
      'append_only',true
    ),
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_attribution_read_model_v1(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_attribution_read_model_v1(timestamptz,timestamptz) to service_role;

create or replace function public.marketing_metrics_read_model_v1(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_payload jsonb;
  v_attribution jsonb;
begin
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    return jsonb_build_object('ok',false,'error','invalid_metrics_window','external_side_effect',false);
  end if;

  v_attribution:=public.marketing_attribution_read_model_v1(v_from,v_to);

  select jsonb_build_object(
    'ok',true,
    'window',jsonb_build_object('from',v_from,'to',v_to),
    'assets',jsonb_build_object(
      'total',(select count(*) from public.marketing_assets a where a.created_at>=v_from and a.created_at<v_to),
      'approved',(select count(*) from public.marketing_assets a where a.reviewed_at>=v_from and a.reviewed_at<v_to and a.status='approved'),
      'by_mode',coalesce((select jsonb_object_agg(generation_mode,cnt) from (select generation_mode,count(*) cnt from public.marketing_assets where created_at>=v_from and created_at<v_to group by generation_mode) x),'{}'::jsonb),
      'estimated_cost_cents',coalesce((select sum(estimated_cost_cents) from public.marketing_assets where created_at>=v_from and created_at<v_to),0),
      'actual_cost_cents',coalesce((select sum(actual_cost_cents) from public.marketing_assets where created_at>=v_from and created_at<v_to),0)
    ),
    'publication_jobs',jsonb_build_object(
      'total',(select count(*) from public.marketing_publication_jobs j where j.created_at>=v_from and j.created_at<v_to),
      'published',(select count(*) from public.marketing_publication_jobs j where j.published_at>=v_from and j.published_at<v_to),
      'scheduled',(select count(*) from public.marketing_publication_jobs j where j.status='scheduled' and j.scheduled_for>=v_from and j.scheduled_for<v_to),
      'review_required',(select count(*) from public.marketing_publication_jobs j where j.status='review_required' and j.updated_at>=v_from and j.updated_at<v_to),
      'by_channel',coalesce((select jsonb_object_agg(channel,cnt) from (select channel,count(*) cnt from public.marketing_publication_jobs where created_at>=v_from and created_at<v_to group by channel) x),'{}'::jsonb),
      'by_status',coalesce((select jsonb_object_agg(status,cnt) from (select status,count(*) cnt from public.marketing_publication_jobs where created_at>=v_from and created_at<v_to group by status) x),'{}'::jsonb)
    ),
    'events',jsonb_build_object(
      'total',(select count(*) from public.marketing_events e where e.created_at>=v_from and e.created_at<v_to),
      'external_side_effects',(select count(*) from public.marketing_events e where e.created_at>=v_from and e.created_at<v_to and e.external_side_effect=true)
    ),
    'attribution',v_attribution,
    'external_side_effect',false
  ) into v_payload;
  return v_payload;
end;
$$;

revoke all on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) to service_role;

comment on table public.marketing_attribution_touchpoints is 'Append-only deterministic marketing evidence. Never infer attribution from proximity or model output.';
comment on function public.record_marketing_attribution_touchpoint_v1(uuid,text,text,text,text,text,uuid,timestamptz,jsonb,uuid) is 'Records deterministic attribution evidence only when explicit runtime gate is enabled; no external side effect.';
comment on function public.marketing_attribution_read_model_v1(timestamptz,timestamptz) is 'Read-only deterministic attribution summary; no inferred conversions.';
comment on function public.marketing_metrics_read_model_v1(timestamptz,timestamptz) is 'Marketing read model only; attribution is deterministic evidence only, with no provider call or publication.';

commit;
