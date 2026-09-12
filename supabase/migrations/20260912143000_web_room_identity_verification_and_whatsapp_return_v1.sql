begin;

create or replace function public.guard_web_existing_customer_binding_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_customer_created_at timestamptz;
begin
  if old.customer_id is null
     and new.customer_id is not null
     and coalesce(old.metadata->>'entry_channel',new.metadata->>'entry_channel','')='website'
     and nullif(coalesce(new.metadata->>'web_identity_verified_at',''),'') is null then
    select c.created_at into v_customer_created_at from public.customers c where c.id=new.customer_id;
    if v_customer_created_at is not null and v_customer_created_at < old.created_at then
      raise exception 'customer_verification_required';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_web_existing_customer_binding_v1 on public.catalog_sessions;
create trigger guard_web_existing_customer_binding_v1
before update of customer_id on public.catalog_sessions
for each row execute function public.guard_web_existing_customer_binding_v1();

revoke all on function public.guard_web_existing_customer_binding_v1() from public,anon,authenticated;
grant execute on function public.guard_web_existing_customer_binding_v1() to service_role;

create or replace function public.confirm_web_room_identity_from_whatsapp_v1(
  p_from text,
  p_text text,
  p_profile_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_match text[];
  v_code text;
  v_session public.catalog_sessions%rowtype;
  v_customer public.customers%rowtype;
  v_pending_customer_id uuid;
  v_variants text[];
  v_identified jsonb;
begin
  v_match:=regexp_match(upper(coalesce(p_text,'')),'DAWEB-([A-Z0-9]{8})');
  if v_match is null then
    return jsonb_build_object('ok',false,'reason','verification_code_not_found');
  end if;
  v_code:=v_match[1];

  select * into v_session
    from public.catalog_sessions s
   where s.status='open'
     and s.expires_at>now()
     and s.metadata->>'web_verify_code'=v_code
     and nullif(s.metadata->>'web_verify_expires_at','')::timestamptz>now()
   order by s.created_at desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','verification_session_not_found');
  end if;

  begin
    v_pending_customer_id:=nullif(v_session.metadata->>'web_pending_customer_id','')::uuid;
  exception when others then
    v_pending_customer_id:=null;
  end;
  if v_pending_customer_id is null then
    return jsonb_build_object('ok',false,'reason','verification_customer_missing');
  end if;

  select * into v_customer from public.customers where id=v_pending_customer_id and is_active=true;
  if not found then
    return jsonb_build_object('ok',false,'reason','verification_customer_missing');
  end if;

  v_variants:=public.phone_variants_br(p_from);
  if coalesce(array_length(v_variants,1),0)=0 then
    return jsonb_build_object('ok',false,'reason','verification_phone_invalid');
  end if;
  if not (
    public.normalize_phone_digits(v_customer.primary_whatsapp_e164)=any(v_variants)
    or exists(
      select 1 from public.customer_phones cp
       where cp.customer_id=v_customer.id
         and public.normalize_phone_digits(cp.phone_e164)=any(v_variants)
    )
  ) then
    return jsonb_build_object('ok',false,'reason','verification_phone_mismatch');
  end if;

  update public.catalog_sessions
     set metadata=coalesce(metadata,'{}'::jsonb)
                  || jsonb_build_object(
                    'web_identity_verified_at',now(),
                    'web_identity_verification_method','whatsapp'
                  ),
         last_activity_at=now()
   where id=v_session.id;

  v_identified:=public.room_identify_customer(
    v_session.public_token,
    coalesce(nullif(trim(v_customer.name),''),nullif(trim(p_profile_name),''),'Cliente'),
    p_from,
    null
  );

  update public.catalog_sessions
     set metadata=(coalesce(metadata,'{}'::jsonb)
                   - 'web_verify_code'
                   - 'web_verify_expires_at'
                   - 'web_pending_customer_id'
                   - 'web_pending_phone')
                  || jsonb_build_object(
                    'web_identity_verified_at',now(),
                    'web_identity_verification_method','whatsapp'
                  ),
         last_activity_at=now()
   where id=v_session.id;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session.id,
    'customer_id',v_customer.id,
    'identified',v_identified
  );
end;
$$;

revoke all on function public.confirm_web_room_identity_from_whatsapp_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_web_room_identity_from_whatsapp_v1(text,text,text) to service_role;

commit;
