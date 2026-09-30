-- Applied to canonical Supabase 20260930021738
-- Dona Antônia Operations 2.0
create or replace function public.canonical_whatsapp_e164_br_v2(p_phone text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  d text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  base text;
begin
  if left(d,2)='00' then d:=substr(d,3); end if;
  if left(d,2)='55' and length(d) in (12,13) then
    base:=substr(d,3);
  elsif length(d) in (10,11) then
    base:=d;
  else
    return null;
  end if;

  -- Brazilian mobile numbers received by some WhatsApp providers can arrive
  -- without the ninth digit. Restore it only for mobile-looking 8-digit
  -- subscribers (first subscriber digit 6-9); landlines remain unchanged.
  if length(base)=10 and substr(base,3,1) ~ '^[6-9]$' then
    base:=substr(base,1,2)||'9'||substr(base,3);
  end if;

  if length(base) not in (10,11) then return null; end if;
  return '+55'||base;
end;
$$;

create or replace function public.phone_variants_br(p_phone text)
returns text[]
language plpgsql
immutable
set search_path to ''
as $$
declare
  raw text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  canonical text:=regexp_replace(coalesce(public.canonical_whatsapp_e164_br_v2(p_phone),''),'[^0-9]','','g');
  base text;
  old_mobile text;
  v text[]:=array[]::text[];
begin
  if raw<>'' then v:=array_append(v,raw); end if;
  if canonical<>'' then
    v:=array_append(v,canonical);
    if left(canonical,2)='55' then
      base:=substr(canonical,3);
      v:=array_append(v,base);
      if length(base)=11 and substr(base,3,1)='9' and substr(base,4,1) ~ '^[6-9]$' then
        old_mobile:=substr(base,1,2)||substr(base,4);
        v:=array_append(v,old_mobile);
        v:=array_append(v,'55'||old_mobile);
      end if;
    end if;
  end if;
  select coalesce(array_agg(x order by length(x),x),array[]::text[]) into v
  from (select distinct x from unnest(v) x where length(x) between 10 and 13) s;
  return v;
end;
$$;

create or replace function public.normalize_storefront_phone_v2(p_phone text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare v text;
begin
  v:=public.canonical_whatsapp_e164_br_v2(p_phone);
  if v is null then raise exception using errcode='22023',message='invalid_phone'; end if;
  return v;
end;
$$;

create table if not exists public.customer_identity_profiles_v1(
  customer_id uuid primary key references public.customers(id) on delete cascade,
  identity_status text not null default 'provisional'
    check(identity_status in ('provisional','verified_flow','verified_existing','review_required','merged')),
  created_from text not null default 'unknown',
  canonical_phone_e164 text,
  last_source_key text,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_identity_profiles_v1 enable row level security;
revoke all on public.customer_identity_profiles_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.customer_identity_profiles_v1 to service_role;

create index if not exists customer_identity_profiles_phone_idx
  on public.customer_identity_profiles_v1(canonical_phone_e164)
  where canonical_phone_e164 is not null;

create or replace function public.ensure_storefront_customer_v2(
  p_phone text,
  p_name text default null,
  p_source_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_ids uuid[];
  v_name_ids uuid[];
  v_customer_id uuid;
  v_created boolean:=false;
  v_ambiguous boolean:=false;
  v_status text:='verified_existing';
begin
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','invalid_phone');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:customer-phone:'||v_phone,0));

  select array_agg(id order by id) into v_ids
  from (
    select c.id
    from public.customers c
    where public.normalize_phone_digits(c.primary_whatsapp_e164)=public.normalize_phone_digits(v_phone)
    union
    select cp.customer_id
    from public.customer_phones cp
    where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
  ) s;

  if coalesce(array_length(v_ids,1),0)=1 then
    v_customer_id:=v_ids[1];
  elsif coalesce(array_length(v_ids,1),0)>1 then
    v_ambiguous:=true;
    if v_name is not null then
      select array_agg(c.id order by c.id) into v_name_ids
      from public.customers c
      where c.id=any(v_ids)
        and lower(btrim(coalesce(c.name,'')))=lower(v_name);
      if coalesce(array_length(v_name_ids,1),0)=1 then
        v_customer_id:=v_name_ids[1];
      end if;
    end if;
  end if;

  if v_customer_id is null then
    select array_agg(id order by id) into v_ids
    from (
      select c.id
      from public.customers c
      where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(public.phone_variants_br(v_phone))
      union
      select cp.customer_id
      from public.customer_phones cp
      where public.normalize_phone_digits(cp.phone_e164)=any(public.phone_variants_br(v_phone))
    ) s;

    if coalesce(array_length(v_ids,1),0)=1 then
      v_customer_id:=v_ids[1];
    elsif coalesce(array_length(v_ids,1),0)>1 then
      v_ambiguous:=true;
      if v_name is not null then
        select array_agg(c.id order by c.id) into v_name_ids
        from public.customers c
        where c.id=any(v_ids)
          and lower(btrim(coalesce(c.name,'')))=lower(v_name);
        if coalesce(array_length(v_name_ids,1),0)=1 then
          v_customer_id:=v_name_ids[1];
        end if;
      end if;
    end if;
  end if;

  if v_customer_id is null then
    begin
      insert into public.customers(name,primary_whatsapp_e164,is_active,created_at,updated_at)
      values(v_name,v_phone,true,now(),now())
      returning id into v_customer_id;
      v_created:=true;
      v_status:='provisional';
    exception when unique_violation then
      select id into v_customer_id
      from public.customers
      where public.normalize_phone_digits(primary_whatsapp_e164)=public.normalize_phone_digits(v_phone)
      limit 1;
      if v_customer_id is null then raise; end if;
      v_created:=false;
      v_status:='verified_existing';
    end;
  else
    update public.customers
       set name=case when nullif(btrim(coalesce(name,'')),'') is null then v_name else name end,
           is_active=true,
           updated_at=now()
     where id=v_customer_id;
  end if;

  if not exists(
    select 1 from public.customer_phones cp
    where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
  ) then
    insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
    values(v_customer_id,v_phone,'site_checkout',true,case when v_created then null else now() end)
    on conflict(phone_e164) do nothing;
  end if;

  insert into public.customer_identity_profiles_v1(
    customer_id,identity_status,created_from,canonical_phone_e164,last_source_key,metadata,updated_at
  ) values(
    v_customer_id,
    case when v_created then 'provisional' else 'verified_existing' end,
    case when v_created then 'site_checkout' else 'existing' end,
    v_phone,
    nullif(left(coalesce(p_source_key,''),220),''),
    jsonb_build_object('ambiguous_variants_observed',v_ambiguous),
    now()
  )
  on conflict(customer_id) do update set
    canonical_phone_e164=coalesce(public.customer_identity_profiles_v1.canonical_phone_e164,excluded.canonical_phone_e164),
    last_source_key=coalesce(excluded.last_source_key,public.customer_identity_profiles_v1.last_source_key),
    metadata=coalesce(public.customer_identity_profiles_v1.metadata,'{}'::jsonb)
      || jsonb_build_object('ambiguous_variants_observed',
           coalesce((public.customer_identity_profiles_v1.metadata->>'ambiguous_variants_observed')::boolean,false)
           or v_ambiguous),
    updated_at=now();

  select identity_status into v_status
  from public.customer_identity_profiles_v1 where customer_id=v_customer_id;

  return jsonb_build_object(
    'ok',true,'customer_id',v_customer_id,'created',v_created,'status',v_status,
    'canonical_phone_e164',v_phone,'ambiguous_variants_observed',v_ambiguous
  );
end;
$$;
revoke all on function public.ensure_storefront_customer_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.ensure_storefront_customer_v2(text,text,text) to service_role;

create or replace function public.ops2_orders_ensure_site_customer_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text;
  v_identity jsonb;
  v_customer_id uuid;
  v_phone text;
begin
  if new.source not in ('vitrine','storefront_v2') or new.customer_id is not null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.phone_e164,'')),'') is null then
    return new;
  end if;

  v_name:=nullif(btrim(coalesce(
    new.customer_snapshot->>'name',
    new.customer_snapshot->>'display_name',
    new.delivery_address->>'customer_name',
    new.checkout_snapshot#>>'{customer,display_name}'
  )),'');
  v_identity:=public.ensure_storefront_customer_v2(new.phone_e164,v_name,coalesce(new.order_number,new.id::text));
  if coalesce((v_identity->>'ok')::boolean,false) is true then
    v_customer_id:=(v_identity->>'customer_id')::uuid;
    v_phone:=v_identity->>'canonical_phone_e164';
    new.customer_id:=v_customer_id;
    new.phone_e164:=coalesce(v_phone,new.phone_e164);
    new.customer_snapshot:=coalesce(new.customer_snapshot,'{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'customer_id',v_customer_id,
        'phone_e164',coalesce(v_phone,new.phone_e164),
        'identity_status',v_identity->>'status'
      ));
    new.delivery_address:=coalesce(new.delivery_address,'{}'::jsonb)
      || jsonb_build_object('source_customer_id',v_customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops2_orders_ensure_site_customer_v1 on public.orders;
create trigger trg_ops2_orders_ensure_site_customer_v1
before insert on public.orders
for each row
execute function public.ops2_orders_ensure_site_customer_v1();

-- Correct the 1018 account to its canonical mobile representation and register 0975.
update public.whatsapp_accounts
   set phone_e164='+5565984491018',updated_at=now()
 where slug='dona-antonia-1018';

insert into public.whatsapp_accounts(
  slug,display_name,phone_e164,phone_number_id,waba_id,is_active,created_at,updated_at
)
select 'dona-antonia-0975','Dona Antônia Atendimento 0975','+5565998150975',null,null,true,now(),now()
where not exists(select 1 from public.whatsapp_accounts where slug='dona-antonia-0975');

update public.whatsapp_accounts
   set phone_e164='+5565998150975',is_active=true,updated_at=now()
 where slug='dona-antonia-0975';

create or replace function public.papoai_ensure_conversation_v2(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.papoai_webhook_inbox_v2%rowtype;
  v_phone_e164 text;
  v_phone_digits text;
  v_business_phone text;
  v_occurred_at timestamptz;
  v_customer_id uuid;
  v_contact_id text;
  v_session_uid text;
  v_account_id uuid;
  v_account_count integer;
  v_conversation_id uuid;
  v_created boolean:=false;
begin
  select * into v_row
  from public.papoai_webhook_inbox_v2
  where id=p_capture_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;
  if v_row.status not in ('normalized','processed') then
    return jsonb_build_object('ok',false,'error','capture_not_normalized','status',v_row.status);
  end if;
  if coalesce(v_row.event_name,'')<>'message.received' then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_inbound_message');
  end if;

  v_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_row.phone_candidate);
  if v_phone_e164 is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error='phone_missing_for_conversation'
     where id=p_capture_id;
    return jsonb_build_object('ok',false,'error','phone_missing_for_conversation');
  end if;
  v_phone_digits:=public.normalize_phone_digits(v_phone_e164);
  v_business_phone:=public.canonical_whatsapp_e164_br_v2(v_row.metadata->>'phone_to');

  begin
    v_occurred_at:=coalesce(nullif(v_row.metadata->>'occurred_at','')::timestamptz,v_row.received_at);
  exception when others then v_occurred_at:=v_row.received_at; end;

  begin
    v_customer_id:=nullif(v_row.metadata->>'customer_id','')::uuid;
  exception when others then v_customer_id:=null; end;

  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.lookup_customer_by_phone(v_phone_e164)
    limit 1;
  end if;

  v_contact_id:=nullif(v_row.metadata->>'contact_id','');
  v_session_uid:=nullif(v_row.conversation_ref,'');

  select count(*),(array_agg(id order by updated_at desc))[1]
    into v_account_count,v_account_id
  from public.whatsapp_accounts
  where is_active=true
    and v_business_phone is not null
    and public.normalize_phone_digits(phone_e164)=public.normalize_phone_digits(v_business_phone);

  if v_account_count<>1 or v_account_id is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',
           last_error=case when v_business_phone is null then 'business_phone_missing'
                           else 'whatsapp_account_unresolved' end
     where id=p_capture_id;
    return jsonb_build_object(
      'ok',false,
      'error',case when v_business_phone is null then 'business_phone_missing' else 'whatsapp_account_unresolved' end,
      'business_phone',v_business_phone,'count',v_account_count
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text||':'||v_phone_digits,0));

  select c.id into v_conversation_id
  from public.conversations c
  where c.whatsapp_account_id=v_account_id
    and public.normalize_phone_digits(c.wa_contact_e164)=any(public.phone_variants_br(v_phone_e164))
    and c.status<>'closed'
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(
      whatsapp_account_id,channel_account_id,customer_id,wa_contact_e164,source,status,stage,
      response_preference,human_required,referral,opened_at,last_inbound_at,
      service_window_expires_at,created_at,updated_at,mode,channel,external_user_id
    ) values (
      v_account_id,v_account_id,v_customer_id,v_phone_e164,'organic','open','new',
      'auto',false,
      jsonb_strip_nulls(jsonb_build_object(
        'source','papoai','papoai_session_uid',v_session_uid,
        'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
      )),
      v_occurred_at,v_occurred_at,v_occurred_at+interval '24 hours',
      now(),now(),'ai','whatsapp',v_phone_e164
    )
    returning id into v_conversation_id;
    v_created:=true;
  else
    update public.conversations
       set customer_id=coalesce(customer_id,v_customer_id),
           wa_contact_e164=v_phone_e164,
           channel_account_id=coalesce(channel_account_id,v_account_id),
           external_user_id=coalesce(external_user_id,v_phone_e164),
           last_inbound_at=greatest(coalesce(last_inbound_at,v_occurred_at),v_occurred_at),
           service_window_expires_at=greatest(
             coalesce(service_window_expires_at,v_occurred_at+interval '24 hours'),
             v_occurred_at+interval '24 hours'
           ),
           referral=coalesce(referral,'{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'source','papoai','papoai_session_uid',v_session_uid,
               'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
             )),
           updated_at=now()
     where id=v_conversation_id;
  end if;

  update public.papoai_webhook_inbox_v2
     set phone_candidate=public.normalize_phone_digits(v_phone_e164),
         metadata=coalesce(metadata,'{}'::jsonb)
           || jsonb_build_object(
             'conversation_id',v_conversation_id,
             'conversation_created',v_created,
             'conversation_bridge_version',3,
             'business_phone_e164',v_business_phone,
             'whatsapp_account_id',v_account_id,
             'canonical_phone_e164',v_phone_e164
           ),
         last_error=null
   where id=p_capture_id;

  return jsonb_build_object(
    'ok',true,'conversation_id',v_conversation_id,'created',v_created,
    'customer_id',v_customer_id,'phone_e164',v_phone_e164,
    'business_phone_e164',v_business_phone,'whatsapp_account_id',v_account_id
  );
end;
$$;
revoke all on function public.papoai_ensure_conversation_v2(uuid) from public,anon,authenticated;
grant execute on function public.papoai_ensure_conversation_v2(uuid) to service_role;

create or replace function public.ops2_reconcile_unlinked_site_orders_v2(p_days integer default 31)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_identity jsonb;
  v_customer_id uuid;
  v_name text;
  v_linked integer:=0;
  v_failed integer:=0;
begin
  for r in
    select *
    from public.orders
    where customer_id is null
      and source in ('vitrine','storefront_v2')
      and created_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,31),365)))
      and nullif(btrim(coalesce(phone_e164,'')),'') is not null
    order by created_at
  loop
    v_name:=nullif(btrim(coalesce(
      r.customer_snapshot->>'name',
      r.customer_snapshot->>'display_name',
      r.delivery_address->>'customer_name',
      r.checkout_snapshot#>>'{customer,display_name}'
    )),'');
    if v_name is null and nullif(r.order_number,'') is not null then
      select nullif(btrim(i.metadata->>'contact_name'),'') into v_name
      from public.papoai_webhook_inbox_v2 i
      where public.normalize_phone_digits(i.phone_candidate)=any(public.phone_variants_br(r.phone_e164))
        and i.received_at between r.created_at-interval '30 minutes' and r.created_at+interval '12 hours'
        and coalesce(i.payload#>>'{data,message,content}',i.payload#>>'{data,message,text}',i.payload#>>'{data,message,body}','')
              ilike '%'||right(r.order_number,8)||'%'
      order by abs(extract(epoch from (i.received_at-r.created_at)))
      limit 1;
      if v_name in ('.','-','_','"."' ) then v_name:=null; end if;
    end if;

    v_identity:=public.ensure_storefront_customer_v2(r.phone_e164,v_name,r.order_number);
    if coalesce((v_identity->>'ok')::boolean,false) is true then
      v_customer_id:=(v_identity->>'customer_id')::uuid;
      update public.orders
         set customer_id=v_customer_id,
             phone_e164=coalesce(v_identity->>'canonical_phone_e164',phone_e164),
             customer_snapshot=coalesce(customer_snapshot,'{}'::jsonb)
               || jsonb_strip_nulls(jsonb_build_object(
                 'customer_id',v_customer_id,
                 'name',v_name,
                 'phone_e164',coalesce(v_identity->>'canonical_phone_e164',phone_e164),
                 'identity_status',v_identity->>'status',
                 'identity_backfilled_at',now()
               )),
             delivery_address=coalesce(delivery_address,'{}'::jsonb)
               || jsonb_build_object('source_customer_id',v_customer_id),
             updated_at=now()
       where id=r.id and customer_id is null;
      if found then v_linked:=v_linked+1; end if;
    else
      v_failed:=v_failed+1;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'linked',v_linked,'failed',v_failed);
end;
$$;
revoke all on function public.ops2_reconcile_unlinked_site_orders_v2(integer) from public,anon,authenticated;
grant execute on function public.ops2_reconcile_unlinked_site_orders_v2(integer) to service_role;
