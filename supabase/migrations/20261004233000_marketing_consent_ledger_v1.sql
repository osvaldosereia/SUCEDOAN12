begin;

create table if not exists public.marketing_consent_events_v1 (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  phone_e164 text,
  decision text not null constraint marketing_consent_events_v1_decision_check check (decision in ('opt_in','opt_out')),
  source text not null,
  source_ref text,
  source_event_key text,
  consent_text_version text,
  consent_text_snapshot text,
  occurred_at timestamptz not null default now(),
  recorded_by text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketing_consent_events_v1_source_event_key_key unique (source_event_key)
);

create index if not exists marketing_consent_events_v1_customer_occurred_idx
  on public.marketing_consent_events_v1(customer_id, occurred_at desc, created_at desc);
create index if not exists marketing_consent_events_v1_phone_occurred_idx
  on public.marketing_consent_events_v1(phone_e164, occurred_at desc)
  where phone_e164 is not null;

alter table public.marketing_consent_events_v1 enable row level security;
revoke all on table public.marketing_consent_events_v1 from public, anon, authenticated;
grant select on table public.marketing_consent_events_v1 to service_role;

create or replace function public.marketing_consent_events_append_only_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'marketing_consent_events_v1_append_only';
end;
$$;

revoke all on function public.marketing_consent_events_append_only_guard_v1() from public, anon, authenticated;

 drop trigger if exists marketing_consent_events_append_only_guard_v1 on public.marketing_consent_events_v1;
create trigger marketing_consent_events_append_only_guard_v1
before update or delete on public.marketing_consent_events_v1
for each row execute function public.marketing_consent_events_append_only_guard_v1();

create or replace function public.marketing_record_consent_v1(
  p_customer_id uuid,
  p_decision text,
  p_source text,
  p_source_ref text default null,
  p_source_event_key text default null,
  p_consent_text_version text default null,
  p_consent_text_snapshot text default null,
  p_occurred_at timestamptz default now(),
  p_recorded_by text default 'system',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_existing public.marketing_consent_events_v1%rowtype;
  v_event_id uuid;
  v_decision text := lower(btrim(coalesce(p_decision,'')));
  v_source text := btrim(coalesce(p_source,''));
  v_phone text;
  v_target boolean;
  v_changed boolean;
  v_occurred_at timestamptz := coalesce(p_occurred_at,now());
  v_previous_guard text;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','invalid_customer');
  end if;
  if v_decision not in ('opt_in','opt_out') then
    return jsonb_build_object('ok',false,'error','invalid_decision');
  end if;
  if v_source = '' then
    return jsonb_build_object('ok',false,'error','invalid_source');
  end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  v_phone := public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
  v_target := (v_decision='opt_in');
  v_changed := coalesce(v_customer.marketing_opt_in,false) is distinct from v_target;

  if nullif(btrim(coalesce(p_source_event_key,'')),'') is not null then
    select * into v_existing
    from public.marketing_consent_events_v1
    where source_event_key=btrim(p_source_event_key)
    limit 1;

    if found then
      if v_existing.customer_id is distinct from p_customer_id
         or v_existing.decision is distinct from v_decision then
        return jsonb_build_object('ok',false,'error','source_event_key_conflict');
      end if;
      return jsonb_build_object(
        'ok',true,
        'idempotent',true,
        'event_id',v_existing.id,
        'customer_id',p_customer_id,
        'decision',v_existing.decision,
        'marketing_opt_in',coalesce(v_customer.marketing_opt_in,false),
        'changed',false
      );
    end if;
  end if;

  insert into public.marketing_consent_events_v1(
    customer_id,phone_e164,decision,source,source_ref,source_event_key,
    consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
  ) values (
    p_customer_id,v_phone,v_decision,v_source,nullif(btrim(coalesce(p_source_ref,'')),''),
    nullif(btrim(coalesce(p_source_event_key,'')),''),
    nullif(btrim(coalesce(p_consent_text_version,'')),''),
    nullif(p_consent_text_snapshot,''),v_occurred_at,
    coalesce(nullif(btrim(coalesce(p_recorded_by,'')),''),'system'),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (source_event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing
    from public.marketing_consent_events_v1
    where source_event_key=btrim(p_source_event_key)
    limit 1;
    if not found then
      return jsonb_build_object('ok',false,'error','consent_event_insert_failed');
    end if;
    if v_existing.customer_id is distinct from p_customer_id
       or v_existing.decision is distinct from v_decision then
      return jsonb_build_object('ok',false,'error','source_event_key_conflict');
    end if;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'event_id',v_existing.id,'customer_id',p_customer_id,
      'decision',v_existing.decision,'marketing_opt_in',coalesce(v_customer.marketing_opt_in,false),'changed',false
    );
  end if;

  v_previous_guard := current_setting('app.marketing_consent_rpc',true);
  perform set_config('app.marketing_consent_rpc','1',true);

  update public.customers
     set marketing_opt_in=v_target,
         marketing_consent_updated_at=v_occurred_at,
         updated_at=now()
   where id=p_customer_id;

  perform set_config('app.marketing_consent_rpc',coalesce(v_previous_guard,''),true);

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'event_id',v_event_id,
    'customer_id',p_customer_id,
    'decision',v_decision,
    'marketing_opt_in',v_target,
    'changed',v_changed
  );
end;
$$;

revoke all on function public.marketing_record_consent_v1(uuid,text,text,text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketing_record_consent_v1(uuid,text,text,text,text,text,text,timestamptz,text,jsonb) to service_role;

-- Backfill somente de consentimentos positivos atualmente conhecidos.
-- marketing_opt_in=false sem evento explícito permanece sem opt_out inventado.
insert into public.marketing_consent_events_v1(
  customer_id,phone_e164,decision,source,source_ref,source_event_key,
  consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
)
select c.id,
       public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164),
       'opt_in','legacy_current_state',null,'legacy_current_state:'||c.id::text,
       null,null,coalesce(c.marketing_consent_updated_at,c.updated_at,c.created_at,now()),
       'migration',jsonb_build_object('backfill',true,'original_marketing_opt_in',true)
from public.customers c
where c.marketing_opt_in is true
on conflict (source_event_key) do nothing;

-- Reaproveita somente evidência explícita de opt-out legado, quando as tabelas existirem.
do $$
begin
  if to_regclass('public.marketing_optout_events_v2') is not null then
    execute $q$
      insert into public.marketing_consent_events_v1(
        customer_id,phone_e164,decision,source,source_ref,source_event_key,
        consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
      )
      select e.customer_id,
             coalesce(public.canonical_whatsapp_e164_br_v2(e.phone_e164),public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164)),
             'opt_out','legacy_optout_event_v2',e.source_event_key,
             'legacy_optout_v2:'||e.id::text,null,null,coalesce(e.occurred_at,now()),'migration',
             jsonb_build_object('backfill',true,'provider',e.provider,'reason_code',e.reason_code,'legacy_source_event_key',e.source_event_key)
      from public.marketing_optout_events_v2 e
      left join public.customers c on c.id=e.customer_id
      where e.customer_id is not null
      on conflict (source_event_key) do nothing
    $q$;
  end if;

  if to_regclass('public.marketing_optout_events_v1') is not null then
    execute $q$
      insert into public.marketing_consent_events_v1(
        customer_id,phone_e164,decision,source,source_ref,source_event_key,
        consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
      )
      select e.customer_id,
             coalesce(public.canonical_whatsapp_e164_br_v2(e.phone_e164),public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164)),
             'opt_out','legacy_optout_event_v1',e.source,
             'legacy_optout_v1:'||e.capture_id::text,null,null,coalesce(e.occurred_at,now()),'migration',
             jsonb_build_object('backfill',true,'reason_code',e.reason_code,'legacy_source',e.source)
      from public.marketing_optout_events_v1 e
      left join public.customers c on c.id=e.customer_id
      where e.customer_id is not null
      on conflict (source_event_key) do nothing
    $q$;
  end if;
end;
$$;

create or replace view public.marketing_customer_consent_current_v1
with (security_invoker=true)
as
select c.id as customer_id,
       public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) as phone_e164,
       case
         when latest.decision='opt_in' then 'opt_in'
         when latest.decision='opt_out' then 'opt_out'
         when coalesce(c.marketing_opt_in,false) is true then 'opt_in'
         else 'never_consented'
       end as consent_state,
       coalesce(c.marketing_opt_in,false) as marketing_opt_in,
       c.marketing_consent_updated_at,
       latest.id as latest_event_id,
       latest.decision as latest_decision,
       latest.source as latest_source,
       latest.source_ref as latest_source_ref,
       latest.consent_text_version,
       latest.occurred_at as latest_event_at
from public.customers c
left join lateral (
  select e.*
  from public.marketing_consent_events_v1 e
  where e.customer_id=c.id
  order by e.occurred_at desc,e.created_at desc,e.id desc
  limit 1
) latest on true;

revoke all on table public.marketing_customer_consent_current_v1 from public, anon, authenticated;
grant select on table public.marketing_customer_consent_current_v1 to service_role;

create or replace function public.marketing_capture_direct_customer_consent_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard text;
begin
  v_guard := current_setting('app.marketing_consent_rpc',true);
  if coalesce(v_guard,'')='1' then
    return new;
  end if;

  if old.marketing_opt_in is not distinct from new.marketing_opt_in then
    return new;
  end if;

  insert into public.marketing_consent_events_v1(
    customer_id,phone_e164,decision,source,source_ref,source_event_key,
    consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata
  ) values (
    new.id,
    public.canonical_whatsapp_e164_br_v2(new.primary_whatsapp_e164),
    case when coalesce(new.marketing_opt_in,false) then 'opt_in' else 'opt_out' end,
    'customer_state_change',null,null,null,null,
    coalesce(new.marketing_consent_updated_at,now()),
    'legacy_trigger:'||current_user,
    jsonb_build_object('old_marketing_opt_in',old.marketing_opt_in,'new_marketing_opt_in',new.marketing_opt_in)
  );
  return new;
end;
$$;

revoke all on function public.marketing_capture_direct_customer_consent_change_v1() from public, anon, authenticated;

drop trigger if exists marketing_capture_direct_customer_consent_change_v1 on public.customers;
create trigger marketing_capture_direct_customer_consent_change_v1
after update of marketing_opt_in on public.customers
for each row
when (old.marketing_opt_in is distinct from new.marketing_opt_in)
execute function public.marketing_capture_direct_customer_consent_change_v1();

create or replace function public.ops2_admin_attendance_marketing_optout_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_previous_opt_in boolean;
  v_record jsonb;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;

  select c.customer_id
    into v_customer_id
  from public.conversations c
  where c.id=p_conversation_id
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;
  if v_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_not_linked');
  end if;

  select coalesce(marketing_opt_in,false)
    into v_previous_opt_in
  from public.customers
  where id=v_customer_id;

  v_record := public.marketing_record_consent_v1(
    v_customer_id,
    'opt_out',
    'attendance_manual_optout',
    p_conversation_id::text,
    null,
    null,
    null,
    now(),
    'admin_attendance',
    jsonb_build_object('conversation_id',p_conversation_id)
  );

  if coalesce((v_record->>'ok')::boolean,false) is not true then
    return v_record;
  end if;

  perform public.marketing_repurchase_recalc_v1(v_customer_id);

  return jsonb_build_object(
    'ok',true,
    'customer_id',v_customer_id,
    'marketing_opt_in',false,
    'changed',v_previous_opt_in,
    'consent_event_id',v_record->>'event_id'
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_marketing_optout_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_marketing_optout_v1(uuid) to service_role;

commit;
