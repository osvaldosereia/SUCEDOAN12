begin;

alter table public.marketing_campaigns_v1
  add column if not exists manual_batch_mode boolean not null default false;

alter table public.marketing_campaign_dispatches_v1
  add column if not exists manual_batch_id uuid;

create table if not exists public.marketing_campaign_manual_batches_v1(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns_v1(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'processing' check(status in ('processing','completed','no_work')),
  requested_limit integer not null default 10 check(requested_limit between 1 and 10),
  claimed_count integer not null default 0 check(claimed_count between 0 and 10),
  worker_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,idempotency_key)
);
create unique index if not exists marketing_campaign_manual_batches_active_idx
  on public.marketing_campaign_manual_batches_v1(campaign_id) where status='processing';
alter table public.marketing_campaign_manual_batches_v1 enable row level security;
revoke all on public.marketing_campaign_manual_batches_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_campaign_manual_batches_v1 to service_role;

alter table public.marketing_campaign_dispatches_v1
  drop constraint if exists marketing_campaign_dispatches_manual_batch_fk;
alter table public.marketing_campaign_dispatches_v1
  add constraint marketing_campaign_dispatches_manual_batch_fk
  foreign key(manual_batch_id) references public.marketing_campaign_manual_batches_v1(id) on delete set null;
create index if not exists marketing_campaign_dispatches_manual_batch_idx
  on public.marketing_campaign_dispatches_v1(manual_batch_id,status) where manual_batch_id is not null;

create or replace function public.marketing_campaign_execution_status_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_execution public.marketing_campaign_execution_runtime_v1%rowtype;
  v_channel public.whatsapp_channel_runtime_v1%rowtype;
  v_total integer:=0; v_pending integer:=0; v_claimed integer:=0; v_skipped integer:=0;
  v_accepted integer:=0; v_retry integer:=0; v_uncertain integer:=0; v_failed integer:=0;
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select * into v_execution from public.marketing_campaign_execution_runtime_v1 where whatsapp_account_id=v_campaign.whatsapp_account_id;
  select * into v_channel from public.whatsapp_channel_runtime_v1 where whatsapp_account_id=v_campaign.whatsapp_account_id;
  select count(*)::integer,count(*) filter(where status='pending')::integer,count(*) filter(where status='claimed')::integer,
         count(*) filter(where status='skipped')::integer,count(*) filter(where status='accepted')::integer,
         count(*) filter(where status='retry')::integer,count(*) filter(where status='uncertain')::integer,
         count(*) filter(where status='failed')::integer
    into v_total,v_pending,v_claimed,v_skipped,v_accepted,v_retry,v_uncertain,v_failed
    from public.marketing_campaign_dispatches_v1 where campaign_id=v_campaign.id;
  return jsonb_build_object(
    'ok',true,'campaign_id',v_campaign.id,'status',v_campaign.status,'revision',v_campaign.revision,
    'manual_batch_mode',v_campaign.manual_batch_mode,'scheduled_for',v_campaign.scheduled_for,
    'started_at',v_campaign.started_at,'paused_at',v_campaign.paused_at,'completed_at',v_campaign.completed_at,
    'failed_at',v_campaign.failed_at,'cancelled_at',v_campaign.cancelled_at,'execution_last_error',v_campaign.execution_last_error,
    'runtime',jsonb_build_object('mode',coalesce(v_execution.mode,'off'),
      'campaigns_enabled',coalesce(v_channel.campaigns_enabled,false),'send_enabled',coalesce(v_channel.send_enabled,false),
      'outbound_provider',v_channel.outbound_provider),
    'counts',jsonb_build_object('total',v_total,'pending',v_pending,'claimed',v_claimed,'skipped',v_skipped,
      'accepted',v_accepted,'retry',v_retry,'uncertain',v_uncertain,'failed',v_failed));
end;
$$;
revoke all on function public.marketing_campaign_execution_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_campaign_execution_status_v1(uuid) to service_role;

create or replace function public.marketing_schedule_campaign_v1(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_scheduled_for timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_gate jsonb;
  v_when timestamptz:=coalesce(p_scheduled_for,now());
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.manual_batch_mode is true then return jsonb_build_object('ok',false,'error','manual_campaign_requires_explicit_batch'); end if;
  if v_campaign.status<>'approved' then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
    where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  update public.marketing_campaigns_v1 set status='scheduled',scheduled_for=v_when,started_at=null,paused_at=null,
    completed_at=null,failed_at=null,execution_last_error=null,updated_at=now() where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,
    'status','scheduled','scheduled_for',v_when,'snapshot_id',v_snapshot.id,'mode',v_gate->>'mode');
end;
$$;
revoke all on function public.marketing_schedule_campaign_v1(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_schedule_campaign_v1(uuid,integer,timestamptz) to service_role;

create or replace function public.marketing_resume_campaign_v1(p_campaign_id uuid,p_scheduled_for timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_gate jsonb;
  v_when timestamptz:=coalesce(p_scheduled_for,now());
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.status<>'paused' then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  if v_campaign.manual_batch_mode is true then return jsonb_build_object('ok',false,'error','manual_campaign_requires_explicit_batch'); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
    where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  update public.marketing_campaigns_v1 set status='scheduled',scheduled_for=v_when,paused_at=null,
    execution_last_error=null,updated_at=now() where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'status','scheduled','scheduled_for',v_when,'mode',v_gate->>'mode');
end;
$$;
revoke all on function public.marketing_resume_campaign_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_resume_campaign_v1(uuid,timestamptz) to service_role;

-- A campaign stays in manual mode after its first explicit batch. Cron can still
-- serve legacy/regular campaigns, but can never claim recipients from this one.
create or replace function public.marketing_claim_dispatch_batch_v1(
  p_whatsapp_account_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_gate jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),10);
  v_campaign record;
  v_items jsonb:='[]'::jsonb;
begin
  v_gate:=public.marketing_campaign_execution_gate_v1(p_whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate||jsonb_build_object('items','[]'::jsonb); end if;

  for v_campaign in
    select c.id
    from public.marketing_campaigns_v1 c
    where c.whatsapp_account_id=p_whatsapp_account_id and c.status='scheduled'
      and coalesce(c.manual_batch_mode,false) is false
      and coalesce(c.scheduled_for,now())<=now()
    order by c.scheduled_for,c.created_at
    for update skip locked
  loop
    perform public.marketing_materialize_dispatches_v1(v_campaign.id);
    update public.marketing_campaigns_v1
      set status='running',started_at=coalesce(started_at,now()),updated_at=now()
      where id=v_campaign.id and status='scheduled' and coalesce(manual_batch_mode,false) is false;
  end loop;

  with picked as (
    select d.id
    from public.marketing_campaign_dispatches_v1 d
    join public.marketing_campaigns_v1 c on c.id=d.campaign_id
    where d.whatsapp_account_id=p_whatsapp_account_id
      and d.status in ('pending','retry')
      and d.available_at<=now()
      and c.status='running'
      and coalesce(c.manual_batch_mode,false) is false
    order by d.available_at,d.created_at,d.id
    for update of d skip locked
    limit v_limit
  ), claimed as (
    update public.marketing_campaign_dispatches_v1 d
      set status='claimed',claimed_at=now(),last_error=null,updated_at=now()
    from picked p
    where d.id=p.id
    returning d.id,d.campaign_id,d.snapshot_id,d.customer_id,d.whatsapp_account_id,d.phone_e164,d.attempt_count,d.outbox_id
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into v_items from claimed;

  return jsonb_build_object('ok',true,'mode',v_gate->>'mode','items',v_items,'count',jsonb_array_length(v_items));
end;
$$;
revoke all on function public.marketing_claim_dispatch_batch_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.marketing_claim_dispatch_batch_v1(uuid,integer) to service_role;

create or replace function public.marketing_begin_manual_campaign_batch_v1(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_gate jsonb;
  v_batch public.marketing_campaign_manual_batches_v1%rowtype;
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),10);
  v_count integer:=0;
begin
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null or length(p_idempotency_key)>180 then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select * into v_batch from public.marketing_campaign_manual_batches_v1
    where campaign_id=v_campaign.id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('ok',true,'batch_id',v_batch.id,'campaign_id',v_campaign.id,
      'status',v_batch.status,'claimed_count',v_batch.claimed_count,'worker_started_at',v_batch.worker_started_at,'replayed',true);
  end if;
  if v_campaign.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_campaign.revision); end if;
  if v_campaign.status not in ('approved','paused') then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
    where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision
    order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  update public.marketing_campaigns_v1
    set manual_batch_mode=true,status='scheduled',scheduled_for=now(),updated_at=now()
    where id=v_campaign.id;
  perform public.marketing_materialize_dispatches_v1(v_campaign.id);
  insert into public.marketing_campaign_manual_batches_v1(campaign_id,idempotency_key,requested_limit)
    values(v_campaign.id,p_idempotency_key,v_limit) returning * into v_batch;
  update public.marketing_campaigns_v1
    set manual_batch_mode=true,status='running',started_at=coalesce(started_at,now()),paused_at=null,
        completed_at=null,failed_at=null,execution_last_error=null,updated_at=now()
    where id=v_campaign.id;

  with picked as (
    select d.id
    from public.marketing_campaign_dispatches_v1 d
    where d.campaign_id=v_campaign.id and d.status in ('pending','retry') and d.available_at<=now()
    order by d.available_at,d.created_at,d.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.marketing_campaign_dispatches_v1 d
    set status='claimed',claimed_at=now(),last_error=null,manual_batch_id=v_batch.id,updated_at=now()
    from picked p where d.id=p.id returning d.id
  ) select count(*)::integer into v_count from claimed;
  update public.marketing_campaign_manual_batches_v1
    set claimed_count=v_count,status=case when v_count=0 then 'no_work' else 'processing' end,
        completed_at=case when v_count=0 then now() else null end
    where id=v_batch.id returning * into v_batch;
  if v_count=0 then
    if exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_campaign.id and d.status in ('pending','retry','claimed')) then
      update public.marketing_campaigns_v1 set status='paused',paused_at=now(),updated_at=now() where id=v_campaign.id;
    else
      update public.marketing_campaigns_v1 set status='completed',completed_at=now(),updated_at=now() where id=v_campaign.id;
    end if;
  end if;
  return jsonb_build_object('ok',true,'batch_id',v_batch.id,'campaign_id',v_campaign.id,
    'status',v_batch.status,'claimed_count',v_count,'worker_started_at',v_batch.worker_started_at,'replayed',false,'mode',v_gate->>'mode');
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','manual_batch_already_active');
end;
$$;
revoke all on function public.marketing_begin_manual_campaign_batch_v1(uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.marketing_begin_manual_campaign_batch_v1(uuid,integer,text,integer) to service_role;

create or replace function public.marketing_acquire_manual_campaign_batch_v1(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.marketing_campaign_manual_batches_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_gate jsonb;
  v_items jsonb:='[]'::jsonb;
begin
  select * into v_batch from public.marketing_campaign_manual_batches_v1 where id=p_batch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','manual_batch_not_found'); end if;
  if v_batch.status<>'processing' then return jsonb_build_object('ok',false,'error','manual_batch_not_processing','status',v_batch.status); end if;
  if v_batch.worker_started_at is not null then return jsonb_build_object('ok',false,'error','manual_batch_already_acquired'); end if;
  select * into v_campaign from public.marketing_campaigns_v1 where id=v_batch.campaign_id;
  if not found or v_campaign.status<>'running' or v_campaign.manual_batch_mode is not true then
    return jsonb_build_object('ok',false,'error','manual_campaign_not_running');
  end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if not exists(select 1 from public.whatsapp_accounts a where a.id=v_campaign.whatsapp_account_id
      and a.is_active is true and a.phone_number_id ~ '^[0-9]{5,30}$') then
    return jsonb_build_object('ok',false,'error','account_not_available');
  end if;
  update public.marketing_campaign_manual_batches_v1 set worker_started_at=now() where id=v_batch.id;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id),'[]'::jsonb) into v_items
    from public.marketing_campaign_dispatches_v1 d
    where d.manual_batch_id=v_batch.id and d.status='claimed';
  return jsonb_build_object('ok',true,'batch_id',v_batch.id,'campaign_id',v_campaign.id,
    'whatsapp_account_id',v_campaign.whatsapp_account_id,'items',v_items,'count',jsonb_array_length(v_items));
end;
$$;
revoke all on function public.marketing_acquire_manual_campaign_batch_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_acquire_manual_campaign_batch_v1(uuid) to service_role;

create or replace function public.marketing_finish_manual_campaign_batch_v1(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.marketing_campaign_manual_batches_v1%rowtype;
  v_claimed integer:=0;
  v_remaining integer:=0;
  v_status text;
begin
  select * into v_batch from public.marketing_campaign_manual_batches_v1 where id=p_batch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','manual_batch_not_found'); end if;
  if v_batch.status='completed' or v_batch.status='no_work' then
    return jsonb_build_object('ok',true,'batch_id',v_batch.id,'status',v_batch.status);
  end if;
  select count(*)::integer into v_claimed from public.marketing_campaign_dispatches_v1
    where manual_batch_id=v_batch.id and status='claimed';
  if v_claimed>0 then return jsonb_build_object('ok',false,'error','manual_batch_has_unfinished_dispatches','claimed_count',v_claimed); end if;
  update public.marketing_campaign_manual_batches_v1 set status='completed',completed_at=now() where id=v_batch.id;
  select count(*)::integer into v_remaining from public.marketing_campaign_dispatches_v1
    where campaign_id=v_batch.campaign_id and status in ('pending','retry','claimed');
  if v_remaining>0 then
    v_status:='paused';
    update public.marketing_campaigns_v1 set status='paused',paused_at=now(),completed_at=null,updated_at=now()
      where id=v_batch.campaign_id and manual_batch_mode is true;
  else
    v_status:='completed';
    update public.marketing_campaigns_v1 set status='completed',completed_at=now(),paused_at=null,updated_at=now()
      where id=v_batch.campaign_id and manual_batch_mode is true;
  end if;
  return jsonb_build_object('ok',true,'batch_id',v_batch.id,'batch_status','completed','campaign_status',v_status,
    'remaining_count',v_remaining);
end;
$$;
revoke all on function public.marketing_finish_manual_campaign_batch_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_finish_manual_campaign_batch_v1(uuid) to service_role;

commit;
