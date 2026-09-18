-- CM-1.5 Consent Ledger + Customer Protection v1
-- Safe-by-default: marketing is blocked unless explicit granted consent is present in the canonical ledger.

alter table public.customer_channel_consents
  add column if not exists policy_version text,
  add column if not exists event_key text,
  add column if not exists recorded_by uuid references public.admin_users(user_id) on delete set null;

create unique index if not exists customer_channel_consents_source_event_uidx
  on public.customer_channel_consents(source,event_key)
  where event_key is not null;

create index if not exists customer_channel_consents_current_idx
  on public.customer_channel_consents(customer_id,channel,purpose,occurred_at desc,created_at desc);

create table if not exists public.customer_contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text check (channel is null or channel in ('whatsapp','web','instagram','messenger','email')),
  purpose text check (purpose is null or purpose in ('service','transactional','marketing')),
  reason_code text not null,
  source text not null default 'system',
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.admin_users(user_id) on delete set null
);

create index if not exists customer_contact_suppressions_active_idx
  on public.customer_contact_suppressions(customer_id,channel,purpose,created_at desc)
  where active=true;

alter table public.customer_contact_suppressions enable row level security;
revoke all on table public.customer_contact_suppressions from public,anon,authenticated;
grant select,insert,update,delete on table public.customer_contact_suppressions to service_role;

create table if not exists public.marketing_contact_policy_v1 (
  id smallint primary key default 1 check (id=1),
  require_granted_consent boolean not null default true,
  cooldown_hours integer not null default 24 check (cooldown_hours between 0 and 720),
  suppress_open_order boolean not null default true,
  suppress_open_handoff boolean not null default true,
  suppress_recent_customer_activity_minutes integer not null default 60
    check (suppress_recent_customer_activity_minutes between 0 and 1440),
  require_active_customer boolean not null default true,
  require_valid_phone boolean not null default true,
  require_linked_channel_identity boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(user_id) on delete set null
);

insert into public.marketing_contact_policy_v1(id)
values(1)
on conflict(id) do nothing;

alter table public.marketing_contact_policy_v1 enable row level security;
revoke all on table public.marketing_contact_policy_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_contact_policy_v1 to service_role;

create or replace view public.customer_consent_current_v1
with (security_invoker=true)
as
select distinct on (c.customer_id,c.channel,c.purpose)
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
from public.customer_channel_consents c
order by c.customer_id,c.channel,c.purpose,c.occurred_at desc,c.created_at desc,c.id desc;

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
  v_row public.customer_channel_consents%rowtype;
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
    select 1 from public.admin_users a
    where a.user_id=p_recorded_by and a.is_active=true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  insert into public.customer_channel_consents(
    customer_id,channel,channel_identity_id,customer_email_id,purpose,status,
    source,evidence,policy_version,event_key,recorded_by,occurred_at,created_at
  )
  values(
    p_customer_id,v_channel,p_channel_identity_id,p_customer_email_id,v_purpose,v_status,
    v_source,v_evidence,v_policy,v_key,p_recorded_by,coalesce(p_occurred_at,now()),now()
  )
  on conflict(source,event_key) where event_key is not null
  do update set event_key=excluded.event_key
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'consent_id',v_row.id,
    'customer_id',v_row.customer_id,
    'channel',v_row.channel,
    'purpose',v_row.purpose,
    'status',v_row.status,
    'policy_version',v_row.policy_version,
    'occurred_at',v_row.occurred_at
  );
end;
$function$;

revoke all on function public.record_customer_consent_v1(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,timestamptz)
from public,anon,authenticated;
grant execute on function public.record_customer_consent_v1(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,timestamptz)
to service_role;

create or replace function public.evaluate_customer_contact_eligibility_v1(
  p_customer_id uuid,
  p_channel text default 'whatsapp',
  p_purpose text default 'marketing',
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
  v_purpose text:=lower(btrim(coalesce(p_purpose,'')));
  v_customer public.customers%rowtype;
  v_policy public.marketing_contact_policy_v1%rowtype;
  v_consent public.customer_consent_current_v1%rowtype;
  v_phone text;
  v_has_identity boolean:=false;
  v_suppressions jsonb:='[]'::jsonb;
  v_open_order boolean:=false;
  v_open_handoff boolean:=false;
  v_recent_activity boolean:=false;
  v_last_marketing_at timestamptz;
  v_reasons text[]:='{}'::text[];
  v_allowed boolean:=true;
begin
  if v_channel not in ('whatsapp','web','instagram','messenger','email') then raise exception 'invalid_channel'; end if;
  if v_purpose not in ('service','transactional','marketing') then raise exception 'invalid_purpose'; end if;

  select * into v_customer from public.customers where id=p_customer_id;
  if not found then raise exception 'customer_not_found'; end if;

  select * into v_policy from public.marketing_contact_policy_v1 where id=1;

  if v_channel='whatsapp' then
    v_phone:=public.canonical_phone_br(v_customer.primary_whatsapp_e164);
    select exists(
      select 1 from public.customer_channel_identities i
      where i.customer_id=p_customer_id
        and i.channel='whatsapp'
        and i.identity_kind='e164'
        and i.verification_status<>'revoked'
    ) into v_has_identity;
  elsif v_channel='email' then
    select exists(
      select 1 from public.customer_emails e
      where e.customer_id=p_customer_id and e.is_primary=true and e.verification_status='verified'
    ) into v_has_identity;
  else
    select exists(
      select 1 from public.customer_channel_identities i
      where i.customer_id=p_customer_id
        and i.channel=v_channel
        and i.verification_status<>'revoked'
    ) into v_has_identity;
  end if;

  select * into v_consent
  from public.customer_consent_current_v1
  where customer_id=p_customer_id and channel=v_channel and purpose=v_purpose
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'reason_code',s.reason_code,'source',s.source,'notes',s.notes,
    'expires_at',s.expires_at,'created_at',s.created_at
  ) order by s.created_at desc),'[]'::jsonb)
  into v_suppressions
  from public.customer_contact_suppressions s
  where s.customer_id=p_customer_id
    and s.active=true
    and (s.expires_at is null or s.expires_at>coalesce(p_at,now()))
    and (s.channel is null or s.channel=v_channel)
    and (s.purpose is null or s.purpose=v_purpose);

  select exists(
    select 1 from public.orders o
    where o.customer_id=p_customer_id
      and lower(coalesce(o.status,'')) not in ('delivered','cancelled','returned')
  ) into v_open_order;

  select exists(
    select 1 from public.human_handoffs h
    where h.customer_id=p_customer_id
      and lower(coalesce(h.status,'')) not in ('resolved','closed','cancelled')
  ) into v_open_handoff;

  if coalesce(v_policy.suppress_recent_customer_activity_minutes,0)>0 then
    select exists(
      select 1 from public.conversations c
      where c.customer_id=p_customer_id
        and c.last_inbound_at is not null
        and c.last_inbound_at >= coalesce(p_at,now()) - make_interval(mins=>v_policy.suppress_recent_customer_activity_minutes)
    ) into v_recent_activity;
  end if;

  if v_purpose='marketing' then
    select max(n.occurred_at) into v_last_marketing_at
    from public.normalized_channel_events n
    where n.customer_id=p_customer_id
      and n.channel=v_channel
      and n.direction='outbound'
      and lower(coalesce(n.source,'')) in ('marketing','campaign','marketing_brain');
  end if;

  if v_policy.require_active_customer and not coalesce(v_customer.is_active,false) then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'customer_inactive');
  end if;

  if v_channel='whatsapp' and v_policy.require_valid_phone and v_phone is null then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'invalid_or_missing_phone');
  end if;

  if v_policy.require_linked_channel_identity and not v_has_identity then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'channel_identity_missing');
  end if;

  if v_purpose='marketing' and v_policy.require_granted_consent then
    if v_consent.id is null then
      v_allowed:=false;v_reasons:=array_append(v_reasons,'marketing_consent_unknown');
    elsif v_consent.status<>'granted' then
      v_allowed:=false;v_reasons:=array_append(v_reasons,'marketing_consent_'||v_consent.status);
    end if;
  end if;

  if jsonb_array_length(v_suppressions)>0 then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'active_suppression');
  end if;

  if v_purpose='marketing' and v_policy.suppress_open_order and v_open_order then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'order_in_progress');
  end if;

  if v_purpose='marketing' and v_policy.suppress_open_handoff and v_open_handoff then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'human_service_in_progress');
  end if;

  if v_purpose='marketing' and v_recent_activity then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'recent_customer_activity');
  end if;

  if v_purpose='marketing'
     and coalesce(v_policy.cooldown_hours,0)>0
     and v_last_marketing_at is not null
     and v_last_marketing_at >= coalesce(p_at,now()) - make_interval(hours=>v_policy.cooldown_hours)
  then
    v_allowed:=false;v_reasons:=array_append(v_reasons,'marketing_cooldown');
  end if;

  return jsonb_build_object(
    'ok',true,
    'allowed',v_allowed,
    'decision',case when v_allowed then 'allowed' else 'suppressed' end,
    'customer_id',p_customer_id,
    'channel',v_channel,
    'purpose',v_purpose,
    'reasons',to_jsonb(v_reasons),
    'consent',case when v_consent.id is null then jsonb_build_object('status','unknown')
      else jsonb_build_object(
        'id',v_consent.id,'status',v_consent.status,'source',v_consent.source,
        'policy_version',v_consent.policy_version,'occurred_at',v_consent.occurred_at
      ) end,
    'state',jsonb_build_object(
      'customer_active',v_customer.is_active,
      'channel_identity_present',v_has_identity,
      'phone_valid',case when v_channel='whatsapp' then v_phone is not null else null end,
      'open_order',v_open_order,
      'open_handoff',v_open_handoff,
      'recent_customer_activity',v_recent_activity,
      'last_marketing_at',v_last_marketing_at,
      'suppressions',v_suppressions
    ),
    'policy',jsonb_build_object(
      'require_granted_consent',v_policy.require_granted_consent,
      'cooldown_hours',v_policy.cooldown_hours,
      'suppress_open_order',v_policy.suppress_open_order,
      'suppress_open_handoff',v_policy.suppress_open_handoff,
      'suppress_recent_customer_activity_minutes',v_policy.suppress_recent_customer_activity_minutes,
      'require_active_customer',v_policy.require_active_customer,
      'require_valid_phone',v_policy.require_valid_phone,
      'require_linked_channel_identity',v_policy.require_linked_channel_identity
    ),
    'evaluated_at',coalesce(p_at,now())
  );
end;
$function$;

revoke all on function public.evaluate_customer_contact_eligibility_v1(uuid,text,text,timestamptz)
from public,anon,authenticated;
grant execute on function public.evaluate_customer_contact_eligibility_v1(uuid,text,text,timestamptz)
to service_role;
