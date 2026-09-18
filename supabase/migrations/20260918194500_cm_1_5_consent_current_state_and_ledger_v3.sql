-- CM-1.5 v3: fix canonical consent model.
-- customer_channel_consents is CURRENT STATE (existing partial unique indexes).
-- customer_channel_consent_events_v1 is the append-only ledger.

drop index if exists public.customer_channel_consents_source_event_uidx;

create table if not exists public.customer_channel_consent_events_v1 (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','web','instagram','messenger','email')),
  channel_identity_id uuid references public.customer_channel_identities(id) on delete set null,
  customer_email_id uuid references public.customer_emails(id) on delete set null,
  purpose text not null check (purpose in ('service','transactional','marketing')),
  status text not null check (status in ('unknown','granted','denied','revoked')),
  source text not null,
  evidence jsonb not null default '{}'::jsonb,
  policy_version text not null,
  event_key text,
  recorded_by uuid references public.admin_users(user_id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(channel_identity_id,customer_email_id)<=1)
);

create unique index if not exists customer_channel_consent_events_source_key_uidx
  on public.customer_channel_consent_events_v1(source,event_key)
  where event_key is not null;

create index if not exists customer_channel_consent_events_customer_idx
  on public.customer_channel_consent_events_v1(customer_id,channel,purpose,occurred_at desc,created_at desc);

alter table public.customer_channel_consent_events_v1 enable row level security;
revoke all on table public.customer_channel_consent_events_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.customer_channel_consent_events_v1 to service_role;

insert into public.customer_channel_consent_events_v1(
  customer_id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,
  policy_version,event_key,recorded_by,occurred_at,created_at
)
select
  c.customer_id,c.channel,c.channel_identity_id,c.customer_email_id,c.purpose,c.status,c.source,c.evidence,
  coalesce(nullif(c.policy_version,''),'legacy-current-state'),
  coalesce(c.event_key,'bootstrap-current:'||c.id::text),
  c.recorded_by,c.occurred_at,c.created_at
from public.customer_channel_consents c
on conflict(source,event_key) where event_key is not null do nothing;

create or replace view public.customer_consent_current_v1
with (security_invoker=true)
as
select
  c.id,
  c.customer_id,
  c.channel,
  c.channel_identity_id,
  c.customer_email_id,
  c.purpose,
  c.status,
  c.source,
  c.evidence,
  c.policy_version,
  c.event_key,
  c.recorded_by,
  c.occurred_at,
  c.created_at
from public.customer_channel_consents c;

create or replace function public.record_customer_consent_v1(
  p_customer_id uuid,
  p_channel text,
  p_purpose text,
  p_status text,
  p_source text,
  p_policy_version text,
  p_evidence jsonb,
  p_event_key text default null,
  p_channel_identity_id uuid default null,
  p_customer_email_id uuid default null,
  p_recorded_by uuid default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
  v_purpose text:=lower(btrim(coalesce(p_purpose,'')));
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_source text:=lower(btrim(coalesce(p_source,'')));
  v_policy text:=btrim(coalesce(p_policy_version,''));
  v_key text:=nullif(btrim(coalesce(p_event_key,'')),'');
  v_evidence jsonb:=coalesce(p_evidence,'{}'::jsonb);
  v_at timestamptz:=coalesce(p_occurred_at,now());
  v_event public.customer_channel_consent_events_v1%rowtype;
  v_current public.customer_channel_consents%rowtype;
begin
  if p_customer_id is null or not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'customer_not_found';
  end if;
  if v_channel not in ('whatsapp','web','instagram','messenger','email') then raise exception 'invalid_channel'; end if;
  if v_purpose not in ('service','transactional','marketing') then raise exception 'invalid_purpose'; end if;
  if v_status not in ('unknown','granted','denied','revoked') then raise exception 'invalid_status'; end if;
  if v_source='' then raise exception 'source_required'; end if;
  if v_policy='' then raise exception 'policy_version_required'; end if;
  if jsonb_typeof(v_evidence)<>'object' then raise exception 'evidence_object_required'; end if;
  if v_status='granted' and nullif(btrim(coalesce(v_evidence->>'method','')),'') is null then
    raise exception 'consent_method_required';
  end if;
  if num_nonnulls(p_channel_identity_id,p_customer_email_id)>1 then
    raise exception 'single_contact_identity_required';
  end if;
  if p_channel_identity_id is not null and not exists(
    select 1 from public.customer_channel_identities i
    where i.id=p_channel_identity_id and i.customer_id=p_customer_id and i.channel=v_channel
  ) then
    raise exception 'channel_identity_not_owned';
  end if;
  if p_customer_email_id is not null and not exists(
    select 1 from public.customer_emails e
    where e.id=p_customer_email_id and e.customer_id=p_customer_id
  ) then
    raise exception 'email_identity_not_owned';
  end if;
  if p_recorded_by is not null and not exists(
    select 1 from public.admin_users a where a.user_id=p_recorded_by and a.is_active=true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  if v_key is not null then
    select * into v_event
    from public.customer_channel_consent_events_v1
    where source=v_source and event_key=v_key
    limit 1;
    if found then
      select * into v_current
      from public.customer_channel_consents c
      where c.customer_id=p_customer_id and c.channel=v_channel and c.purpose=v_purpose
        and (
          (p_channel_identity_id is not null and c.channel_identity_id=p_channel_identity_id)
          or (p_customer_email_id is not null and c.customer_email_id=p_customer_email_id)
          or (p_channel_identity_id is null and p_customer_email_id is null and c.channel_identity_id is null and c.customer_email_id is null)
        )
      limit 1;
      return jsonb_build_object(
        'ok',true,'idempotent',true,'event_id',v_event.id,
        'consent_id',v_current.id,'customer_id',p_customer_id,'channel',v_channel,'purpose',v_purpose,
        'status',coalesce(v_current.status,v_event.status),'policy_version',v_event.policy_version,
        'occurred_at',v_event.occurred_at
      );
    end if;
  end if;

  insert into public.customer_channel_consent_events_v1(
    customer_id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,
    policy_version,event_key,recorded_by,occurred_at,created_at
  )
  values(
    p_customer_id,v_channel,p_channel_identity_id,p_customer_email_id,v_purpose,v_status,v_source,v_evidence,
    v_policy,v_key,p_recorded_by,v_at,now()
  )
  returning * into v_event;

  if p_channel_identity_id is not null then
    insert into public.customer_channel_consents(
      customer_id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,
      policy_version,event_key,recorded_by,occurred_at,created_at
    )
    values(
      p_customer_id,v_channel,p_channel_identity_id,null,v_purpose,v_status,v_source,v_evidence,
      v_policy,v_key,p_recorded_by,v_at,now()
    )
    on conflict(customer_id,channel,purpose,channel_identity_id) where channel_identity_id is not null
    do update set
      status=excluded.status,source=excluded.source,evidence=excluded.evidence,
      policy_version=excluded.policy_version,event_key=excluded.event_key,recorded_by=excluded.recorded_by,
      occurred_at=excluded.occurred_at
    where excluded.occurred_at>=public.customer_channel_consents.occurred_at
    returning * into v_current;
  elsif p_customer_email_id is not null then
    insert into public.customer_channel_consents(
      customer_id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,
      policy_version,event_key,recorded_by,occurred_at,created_at
    )
    values(
      p_customer_id,v_channel,null,p_customer_email_id,v_purpose,v_status,v_source,v_evidence,
      v_policy,v_key,p_recorded_by,v_at,now()
    )
    on conflict(customer_id,channel,purpose,customer_email_id) where customer_email_id is not null
    do update set
      status=excluded.status,source=excluded.source,evidence=excluded.evidence,
      policy_version=excluded.policy_version,event_key=excluded.event_key,recorded_by=excluded.recorded_by,
      occurred_at=excluded.occurred_at
    where excluded.occurred_at>=public.customer_channel_consents.occurred_at
    returning * into v_current;
  else
    insert into public.customer_channel_consents(
      customer_id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,
      policy_version,event_key,recorded_by,occurred_at,created_at
    )
    values(
      p_customer_id,v_channel,null,null,v_purpose,v_status,v_source,v_evidence,
      v_policy,v_key,p_recorded_by,v_at,now()
    )
    on conflict(customer_id,channel,purpose) where channel_identity_id is null and customer_email_id is null
    do update set
      status=excluded.status,source=excluded.source,evidence=excluded.evidence,
      policy_version=excluded.policy_version,event_key=excluded.event_key,recorded_by=excluded.recorded_by,
      occurred_at=excluded.occurred_at
    where excluded.occurred_at>=public.customer_channel_consents.occurred_at
    returning * into v_current;
  end if;

  if v_current.id is null then
    select * into v_current
    from public.customer_channel_consents c
    where c.customer_id=p_customer_id and c.channel=v_channel and c.purpose=v_purpose
      and (
        (p_channel_identity_id is not null and c.channel_identity_id=p_channel_identity_id)
        or (p_customer_email_id is not null and c.customer_email_id=p_customer_email_id)
        or (p_channel_identity_id is null and p_customer_email_id is null and c.channel_identity_id is null and c.customer_email_id is null)
      )
    limit 1;
  end if;

  if v_channel='whatsapp' and v_purpose='marketing' then
    update public.customers
       set marketing_opt_in=(v_current.status='granted'),
           marketing_consent_updated_at=v_current.occurred_at,
           updated_at=now()
     where id=p_customer_id;
  end if;

  return jsonb_build_object(
    'ok',true,'idempotent',false,'event_id',v_event.id,'consent_id',v_current.id,
    'customer_id',p_customer_id,'channel',v_channel,'purpose',v_purpose,
    'status',v_current.status,'policy_version',v_current.policy_version,'occurred_at',v_current.occurred_at
  );
end;
$function$;

revoke all on function public.record_customer_consent_v1(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,timestamptz)
from public,anon,authenticated;
grant execute on function public.record_customer_consent_v1(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,timestamptz)
to service_role;
