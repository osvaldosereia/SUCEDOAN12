-- CM-1.5 v2: canonical consent ledger becomes source of truth for legacy marketing_opt_in cache
-- and Shopping Room explicit preference writes into the canonical ledger.

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

  if v_row.channel='whatsapp' and v_row.purpose='marketing' then
    update public.customers
       set marketing_opt_in=(v_row.status='granted'),
           marketing_consent_updated_at=v_row.occurred_at,
           updated_at=now()
     where id=v_row.customer_id;
  end if;

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

create or replace function public.room_save_customer_preferences(
  p_public_token text,
  p_day integer default null,
  p_month integer default null,
  p_marketing_opt_in boolean default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  s public.catalog_sessions%rowtype;
  c public.customers%rowtype;
  v_consent_status text;
  v_identity_id uuid;
begin
  select * into s
  from public.catalog_sessions
  where public_token=p_public_token and status='open' and expires_at>now()
  for update;
  if not found then raise exception 'room_unavailable'; end if;
  if s.customer_id is null then raise exception 'customer_identification_required'; end if;

  if (p_day is null)<>(p_month is null) then raise exception 'Informe dia e mês do aniversário.'; end if;
  if p_day is not null then
    if p_month not between 1 and 12 or p_day not between 1 and 31 then raise exception 'Aniversário inválido.'; end if;
    begin
      perform make_date(2000,p_month,p_day);
    exception when others then
      raise exception 'Aniversário inválido.';
    end;
  end if;

  select * into c from public.customers where id=s.customer_id for update;

  if p_day is not null then
    update public.customers
       set birthday_day=p_day,birthday_month=p_month,updated_at=now()
     where id=c.id;
  end if;

  if p_marketing_opt_in is not null
     and (p_marketing_opt_in is distinct from c.marketing_opt_in or c.marketing_consent_updated_at is null)
  then
    v_consent_status:=case
      when p_marketing_opt_in then 'granted'
      when coalesce(c.marketing_opt_in,false) then 'revoked'
      else 'denied'
    end;

    select i.id into v_identity_id
    from public.customer_channel_identities i
    where i.customer_id=c.id
      and i.channel='whatsapp'
      and i.identity_kind='e164'
      and i.verification_status<>'revoked'
    order by case when i.verification_status='verified' then 0 else 1 end,i.updated_at desc
    limit 1;

    perform public.record_customer_consent_v1(
      p_customer_id=>c.id,
      p_channel=>'whatsapp',
      p_purpose=>'marketing',
      p_status=>v_consent_status,
      p_source=>'shopping_room',
      p_policy_version=>'2026-09-07-v1',
      p_evidence=>jsonb_build_object(
        'method','explicit_checkbox',
        'surface','shopping_room',
        'catalog_session_id',s.id,
        'preference_value',p_marketing_opt_in
      ),
      p_event_key=>null,
      p_channel_identity_id=>v_identity_id,
      p_customer_email_id=>null,
      p_recorded_by=>null,
      p_occurred_at=>now()
    );

    insert into public.customer_consent_events(customer_id,catalog_session_id,granted)
    values(c.id,s.id,p_marketing_opt_in);
  end if;

  return jsonb_build_object('saved',true);
end
$function$;
