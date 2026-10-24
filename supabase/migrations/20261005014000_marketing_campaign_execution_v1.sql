begin;

-- Fase E: infraestrutura executável de campanhas. O runtime nasce OFF e não há
-- qualquer RPC nesta migration capaz de promover off -> canary/live.
create table if not exists public.marketing_campaign_execution_runtime_v1(
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off','canary','live')),
  max_batch_size integer not null default 10 check (max_batch_size between 1 and 25),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
alter table public.marketing_campaign_execution_runtime_v1 enable row level security;
revoke all on public.marketing_campaign_execution_runtime_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_campaign_execution_runtime_v1 to service_role;

insert into public.marketing_campaign_execution_runtime_v1(whatsapp_account_id,mode)
select a.id,'off'
from public.whatsapp_accounts a
on conflict(whatsapp_account_id) do nothing;

alter table public.marketing_campaigns_v1
  drop constraint if exists marketing_campaigns_v1_status_check;
alter table public.marketing_campaigns_v1
  add constraint marketing_campaigns_v1_status_check
  check(status in ('draft','ready_for_review','approved','scheduled','running','paused','completed','failed','cancelled'));

alter table public.marketing_campaigns_v1
  add column if not exists scheduled_for timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists execution_last_error text;

create table if not exists public.marketing_campaign_dispatches_v1(
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.marketing_campaign_snapshots_v1(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns_v1(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  phone_e164 text,
  status text not null default 'pending' check(status in ('pending','claimed','skipped','accepted','retry','uncertain','failed')),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_message_id text,
  last_error text,
  skip_reason text,
  outbox_id uuid references public.whatsapp_outbox_v1(id) on delete set null,
  eligibility_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(snapshot_id,customer_id)
);
alter table public.marketing_campaign_dispatches_v1 enable row level security;
revoke all on public.marketing_campaign_dispatches_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_campaign_dispatches_v1 to service_role;

create index if not exists marketing_campaign_dispatches_v1_claim_idx
  on public.marketing_campaign_dispatches_v1(whatsapp_account_id,status,available_at,created_at)
  where status in ('pending','retry');
create index if not exists marketing_campaign_dispatches_v1_campaign_idx
  on public.marketing_campaign_dispatches_v1(campaign_id,status,created_at);

create or replace function public.marketing_campaign_dispatch_identity_guard_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.snapshot_id is distinct from old.snapshot_id
     or new.campaign_id is distinct from old.campaign_id
     or new.customer_id is distinct from old.customer_id
     or new.whatsapp_account_id is distinct from old.whatsapp_account_id
     or new.phone_e164 is distinct from old.phone_e164 then
    raise exception 'marketing_campaign_dispatch_identity_immutable' using errcode='55000';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists marketing_campaign_dispatch_identity_guard_v1 on public.marketing_campaign_dispatches_v1;
create trigger marketing_campaign_dispatch_identity_guard_v1
before update on public.marketing_campaign_dispatches_v1
for each row execute function public.marketing_campaign_dispatch_identity_guard_v1();

create or replace function public.marketing_campaign_execution_gate_v1(p_whatsapp_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_channel public.whatsapp_channel_runtime_v1%rowtype;
  v_execution public.marketing_campaign_execution_runtime_v1%rowtype;
begin
  select * into v_channel from public.whatsapp_channel_runtime_v1 where whatsapp_account_id=p_whatsapp_account_id;
  select * into v_execution from public.marketing_campaign_execution_runtime_v1 where whatsapp_account_id=p_whatsapp_account_id;
  if not found then
    return jsonb_build_object('ok',false,'error','campaigns_disabled','mode','off');
  end if;
  if v_channel.whatsapp_account_id is null
     or v_channel.campaigns_enabled is not true
     or v_channel.send_enabled is not true
     or v_channel.outbound_provider <> 'meta'
     or v_execution.mode='off' then
    return jsonb_build_object('ok',false,'error','campaigns_disabled','mode',coalesce(v_execution.mode,'off'));
  end if;
  return jsonb_build_object('ok',true,'mode',v_execution.mode);
end;
$$;
revoke all on function public.marketing_campaign_execution_gate_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_campaign_execution_gate_v1(uuid) to service_role;

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
  if v_campaign.status<>'approved' then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;

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
  set status='scheduled',scheduled_for=v_when,started_at=null,paused_at=null,completed_at=null,failed_at=null,
      execution_last_error=null,updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'revision',v_campaign.revision,
    'status','scheduled','scheduled_for',v_when,'snapshot_id',v_snapshot.id,'mode',v_gate->>'mode');
end;
$$;
revoke all on function public.marketing_schedule_campaign_v1(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_schedule_campaign_v1(uuid,integer,timestamptz) to service_role;

create or replace function public.marketing_pause_campaign_v1(p_campaign_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_campaign public.marketing_campaigns_v1%rowtype;
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.status not in ('scheduled','running') then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  update public.marketing_campaigns_v1
  set status='paused',paused_at=now(),execution_last_error=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
  where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'status','paused');
end;
$$;
revoke all on function public.marketing_pause_campaign_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_pause_campaign_v1(uuid,text) to service_role;

create or replace function public.marketing_resume_campaign_v1(
  p_campaign_id uuid,
  p_scheduled_for timestamptz default now()
)
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
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
   where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;
  select * into v_template from public.whatsapp_templates_v1
   where id=v_campaign.template_id and whatsapp_account_id=v_campaign.whatsapp_account_id
     and upper(category)='MARKETING' and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  v_gate:=public.marketing_campaign_execution_gate_v1(v_campaign.whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  update public.marketing_campaigns_v1
  set status='scheduled',scheduled_for=v_when,paused_at=null,execution_last_error=null,updated_at=now()
  where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'status','scheduled','scheduled_for',v_when,'mode',v_gate->>'mode');
end;
$$;
revoke all on function public.marketing_resume_campaign_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_resume_campaign_v1(uuid,timestamptz) to service_role;

create or replace function public.marketing_materialize_dispatches_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_inserted integer:=0;
  v_total integer:=0;
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.status not in ('scheduled','running','paused') then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;
  select * into v_snapshot from public.marketing_campaign_snapshots_v1
  where campaign_id=v_campaign.id and campaign_revision=v_campaign.revision
  order by snapshot_version desc limit 1;
  if not found then return jsonb_build_object('ok',false,'error','snapshot_stale'); end if;

  insert into public.marketing_campaign_dispatches_v1(
    snapshot_id,campaign_id,customer_id,whatsapp_account_id,phone_e164,status,available_at,metadata
  )
  select r.snapshot_id,r.campaign_id,r.customer_id,r.whatsapp_account_id,r.phone_e164,'pending',
         greatest(coalesce(v_campaign.scheduled_for,now()),now()),
         jsonb_build_object('eligible_at_snapshot',r.eligible_at_snapshot,'exclusion_reasons',r.exclusion_reasons,'snapshot_recipient_id',r.id)
  from public.marketing_campaign_snapshot_recipients_v1 r
  where r.snapshot_id=v_snapshot.id
  on conflict(snapshot_id,customer_id) do nothing;
  get diagnostics v_inserted=row_count;
  select count(*)::integer into v_total from public.marketing_campaign_dispatches_v1 where snapshot_id=v_snapshot.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'snapshot_id',v_snapshot.id,'inserted',v_inserted,'total',v_total);
end;
$$;
revoke all on function public.marketing_materialize_dispatches_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_materialize_dispatches_v1(uuid) to service_role;

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
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),25);
  v_campaign record;
  v_items jsonb:='[]'::jsonb;
begin
  v_gate:=public.marketing_campaign_execution_gate_v1(p_whatsapp_account_id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate||jsonb_build_object('items','[]'::jsonb); end if;

  for v_campaign in
    select c.id
    from public.marketing_campaigns_v1 c
    where c.whatsapp_account_id=p_whatsapp_account_id and c.status='scheduled'
      and coalesce(c.scheduled_for,now())<=now()
    order by c.scheduled_for,c.created_at
    for update skip locked
  loop
    perform public.marketing_materialize_dispatches_v1(v_campaign.id);
    update public.marketing_campaigns_v1
      set status='running',started_at=coalesce(started_at,now()),updated_at=now()
      where id=v_campaign.id and status='scheduled';
  end loop;

  with picked as (
    select d.id
    from public.marketing_campaign_dispatches_v1 d
    join public.marketing_campaigns_v1 c on c.id=d.campaign_id
    where d.whatsapp_account_id=p_whatsapp_account_id
      and d.status in ('pending','retry')
      and d.available_at<=now()
      and c.status='running'
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

create or replace function public.marketing_revalidate_dispatch_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_snapshot public.marketing_campaign_snapshots_v1%rowtype;
  v_customer public.customers%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_consent record;
  v_gate jsonb;
  v_phone text;
  v_conversation jsonb;
  v_enqueue jsonb;
  v_key text;
  v_reason text;
begin
  select * into v_dispatch from public.marketing_campaign_dispatches_v1 where id=p_dispatch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;
  if v_dispatch.status<>'claimed' then return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status); end if;

  select * into v_campaign from public.marketing_campaigns_v1 where id=v_dispatch.campaign_id;
  if not found then v_reason:='campaign_not_found';
  elsif v_campaign.status='paused' then
    update public.marketing_campaign_dispatches_v1 set status='pending',claimed_at=null,available_at=now()+interval '1 minute',last_error='campaign_paused' where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','campaign_paused','dispatch_id',v_dispatch.id);
  elsif v_campaign.status='cancelled' then v_reason:='campaign_cancelled';
  elsif v_campaign.status<>'running' then v_reason:='campaign_not_runnable';
  end if;

  if v_reason is null then
    v_gate:=public.marketing_campaign_execution_gate_v1(v_dispatch.whatsapp_account_id);
    if coalesce((v_gate->>'ok')::boolean,false) is not true then
      update public.marketing_campaign_dispatches_v1 set status='pending',claimed_at=null,available_at=now()+interval '1 minute',last_error='campaigns_disabled' where id=v_dispatch.id;
      return v_gate||jsonb_build_object('dispatch_id',v_dispatch.id);
    end if;
  end if;

  if v_reason is null then
    select * into v_snapshot from public.marketing_campaign_snapshots_v1 where id=v_dispatch.snapshot_id;
    if not found or v_snapshot.campaign_id<>v_campaign.id or v_snapshot.campaign_revision<>v_campaign.revision then v_reason:='snapshot_stale'; end if;
  end if;

  if v_reason is null then
    select * into v_template from public.whatsapp_templates_v1
    where id=v_campaign.template_id and whatsapp_account_id=v_dispatch.whatsapp_account_id
      and upper(category)='MARKETING' and upper(status)='APPROVED';
    if not found then v_reason:='template_not_sendable'; end if;
  end if;

  if v_reason is null then
    select * into v_customer from public.customers where id=v_dispatch.customer_id;
    if not found or v_customer.is_active is not true then v_reason:='inactive_customer'; end if;
  end if;

  if v_reason is null then
    select * into v_consent from public.marketing_customer_consent_current_v1 where customer_id=v_dispatch.customer_id;
    if not found or coalesce(v_consent.consent_state,'never_consented')<>'opt_in' then
      v_reason:=case when coalesce(v_consent.consent_state,'never_consented')='opt_out' then 'opted_out' else 'no_consent' end;
    end if;
  end if;

  if v_reason is null then
    v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
    if v_phone is null then v_reason:='invalid_phone';
    elsif v_dispatch.phone_e164 is null or v_phone<>v_dispatch.phone_e164 then v_reason:='phone_changed';
    end if;
  end if;

  if v_reason is not null then
    update public.marketing_campaign_dispatches_v1
      set status='skipped',skip_reason=v_reason,last_error=null,claimed_at=null,eligibility_checked_at=now(),updated_at=now()
      where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','dispatch_skipped','skip_reason',v_reason,'dispatch_id',v_dispatch.id);
  end if;

  v_conversation:=public.whatsapp_resolve_conversation_v1(v_dispatch.whatsapp_account_id,v_phone,v_dispatch.customer_id,'campaign');
  if coalesce((v_conversation->>'ok')::boolean,false) is not true then
    update public.marketing_campaign_dispatches_v1 set status='retry',claimed_at=null,available_at=now()+interval '30 seconds',last_error='conversation_unavailable',updated_at=now() where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','conversation_unavailable','dispatch_id',v_dispatch.id);
  end if;

  v_key:=format('campaign:%s:snapshot:%s:customer:%s',v_dispatch.campaign_id,v_dispatch.snapshot_id,v_dispatch.customer_id);
  v_enqueue:=public.whatsapp_enqueue_outbound_v1(
    v_key,
    v_dispatch.whatsapp_account_id,
    (v_conversation->>'conversation_id')::uuid,
    v_dispatch.customer_id,
    v_phone,
    'marketing_campaign',
    'template',
    jsonb_build_object(
      'campaign_id',v_campaign.id,
      'snapshot_id',v_snapshot.id,
      'dispatch_id',v_dispatch.id,
      'template_name',v_snapshot.template_name,
      'language_code',v_snapshot.template_language,
      'template_components',v_snapshot.template_components,
      'variable_values',v_snapshot.variable_values_snapshot,
      'deep_link',v_snapshot.deep_link_snapshot
    ),
    'automation',
    v_campaign.template_id
  );
  if coalesce((v_enqueue->>'ok')::boolean,false) is not true then
    update public.marketing_campaign_dispatches_v1 set status='retry',claimed_at=null,available_at=now()+interval '30 seconds',last_error=coalesce(v_enqueue->>'error','outbox_enqueue_failed'),updated_at=now() where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error',coalesce(v_enqueue->>'error','outbox_enqueue_failed'),'dispatch_id',v_dispatch.id);
  end if;

  update public.marketing_campaign_dispatches_v1
    set outbox_id=(v_enqueue->>'outbox_id')::uuid,eligibility_checked_at=now(),skip_reason=null,last_error=null,updated_at=now()
    where id=v_dispatch.id;

  return jsonb_build_object(
    'ok',true,'dispatch_id',v_dispatch.id,'outbox_id',(v_enqueue->>'outbox_id')::uuid,
    'campaign_id',v_campaign.id,'snapshot_id',v_snapshot.id,'whatsapp_account_id',v_dispatch.whatsapp_account_id,
    'customer_id',v_dispatch.customer_id,'to_phone_e164',v_phone,'template_id',v_campaign.template_id,
    'template_name',v_snapshot.template_name,'language_code',v_snapshot.template_language,
    'template_components',v_snapshot.template_components,'variable_values',v_snapshot.variable_values_snapshot,
    'mode',v_gate->>'mode'
  );
end;
$$;
revoke all on function public.marketing_revalidate_dispatch_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_revalidate_dispatch_v1(uuid) to service_role;

create or replace function public.marketing_finish_dispatch_v1(
  p_dispatch_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_last_error text default null,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_attempt integer;
  v_retry_seconds integer;
  v_final text;
  v_has_fail boolean;
begin
  select * into v_dispatch from public.marketing_campaign_dispatches_v1 where id=p_dispatch_id for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;
  if v_dispatch.status='accepted' and v_status='accepted' and v_dispatch.provider_message_id=p_provider_message_id then
    return jsonb_build_object('ok',true,'duplicate',true,'dispatch_id',v_dispatch.id,'status','accepted','provider_message_id',v_dispatch.provider_message_id);
  end if;
  if v_dispatch.status<>'claimed' then return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status); end if;
  if v_status not in ('accepted','retry','uncertain','failed','skipped') then return jsonb_build_object('ok',false,'error','invalid_dispatch_status'); end if;

  if v_status='skipped' then
    update public.marketing_campaign_dispatches_v1
      set status='skipped',skip_reason=coalesce(nullif(btrim(coalesce(p_last_error,'')),''),'worker_skipped'),claimed_at=null,updated_at=now()
      where id=v_dispatch.id returning * into v_dispatch;
  else
    v_attempt:=v_dispatch.attempt_count+1;
    if v_status='accepted' then
      if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null or p_provider_message_id !~ '^wamid\\.' then
        return jsonb_build_object('ok',false,'error','provider_message_id_required');
      end if;
      update public.marketing_campaign_dispatches_v1
        set status='accepted',attempt_count=v_attempt,provider_message_id=p_provider_message_id,last_error=null,claimed_at=null,updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='sent',attempt_count=v_attempt,provider_message_id=p_provider_message_id,last_error=null,sent_at=now(),updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    elsif v_status='retry' and v_attempt<3 then
      v_retry_seconds:=least(greatest(coalesce(p_retry_after_seconds,30),1),3600);
      update public.marketing_campaign_dispatches_v1
        set status='retry',attempt_count=v_attempt,available_at=now()+make_interval(secs=>v_retry_seconds),claimed_at=null,last_error=nullif(btrim(coalesce(p_last_error,'')),''),updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='queued',attempt_count=v_attempt,available_at=v_dispatch.available_at,claimed_at=null,last_error=v_dispatch.last_error,updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    else
      v_final:=case when v_status='uncertain' then 'uncertain' else 'failed' end;
      update public.marketing_campaign_dispatches_v1
        set status=v_final,attempt_count=v_attempt,claimed_at=null,last_error=nullif(btrim(coalesce(p_last_error,'')),''),updated_at=now()
        where id=v_dispatch.id returning * into v_dispatch;
      if v_dispatch.outbox_id is not null then
        update public.whatsapp_outbox_v1 set status='failed',attempt_count=v_attempt,last_error=coalesce(v_dispatch.last_error,v_final),updated_at=now()
        where id=v_dispatch.outbox_id;
      end if;
    end if;
  end if;

  if v_dispatch.status in ('accepted','skipped','uncertain','failed')
     and not exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_dispatch.campaign_id and d.status in ('pending','claimed','retry')) then
    select exists(select 1 from public.marketing_campaign_dispatches_v1 d where d.campaign_id=v_dispatch.campaign_id and d.status in ('uncertain','failed')) into v_has_fail;
    update public.marketing_campaigns_v1
      set status=case when v_has_fail then 'failed' else 'completed' end,
          completed_at=case when v_has_fail then completed_at else now() end,
          failed_at=case when v_has_fail then now() else failed_at end,
          execution_last_error=case when v_has_fail then 'dispatch_failure' else null end,
          updated_at=now()
      where id=v_dispatch.campaign_id and status in ('running','scheduled','paused');
  end if;

  return jsonb_build_object('ok',true,'dispatch_id',v_dispatch.id,'status',v_dispatch.status,'attempt_count',v_dispatch.attempt_count,
    'provider_message_id',v_dispatch.provider_message_id,'available_at',v_dispatch.available_at);
end;
$$;
revoke all on function public.marketing_finish_dispatch_v1(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.marketing_finish_dispatch_v1(uuid,text,text,text,integer) to service_role;

commit;
