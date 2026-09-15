begin;

create or replace function public.room_commit_web_customer_v1(
  p_public_token text,
  p_customer_id uuid,
  p_name text,
  p_phone text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_customer_id uuid;
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_phone text:=public.canonical_phone_br(p_phone);
  v_variants text[]:=public.phone_variants_br(p_phone);
  v_pending uuid;
  v_conflict uuid;
begin
  select * into v_session
    from public.catalog_sessions
   where public_token=p_public_token
     and status='open'
     and expires_at>now()
   for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'customer_name_required'; end if;
  if v_phone is null or coalesce(array_length(v_variants,1),0)=0 then raise exception 'valid_whatsapp_required'; end if;

  begin
    v_pending:=nullif(v_session.metadata->>'web_pending_customer_id','')::uuid;
  exception when invalid_text_representation then
    v_pending:=null;
  end;

  if p_customer_id is not null then
    if p_customer_id<>coalesce(v_session.customer_id,v_pending) then
      raise exception 'customer_not_authorized';
    end if;
    v_customer_id:=p_customer_id;
  elsif v_session.customer_id is not null then
    v_customer_id:=v_session.customer_id;
  end if;

  select q.id into v_conflict
    from (
      select c.id
        from public.customers c
       where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(v_variants)
      union
      select cp.customer_id id
        from public.customer_phones cp
       where public.normalize_phone_digits(cp.phone_e164)=any(v_variants)
    ) q
   where v_customer_id is null or q.id<>v_customer_id
   limit 1;
  if v_conflict is not null then raise exception 'customer_identity_conflict'; end if;

  if v_customer_id is null then
    insert into public.customers(name,primary_whatsapp_e164,preferred_reply,is_active)
    values(v_name,v_phone,'auto',true)
    returning id into v_customer_id;
  else
    update public.customers
       set name=v_name,
           primary_whatsapp_e164=v_phone,
           updated_at=now()
     where id=v_customer_id;
    if not found then raise exception 'customer_not_found'; end if;
  end if;

  update public.customer_phones
     set is_primary=false
   where customer_id=v_customer_id
     and phone_e164<>v_phone
     and is_primary=true;

  insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
  values(v_customer_id,v_phone,'web_checkout',true,now())
  on conflict (phone_e164) do update
     set source='web_checkout',
         is_primary=true,
         verified_at=now()
   where public.customer_phones.customer_id=excluded.customer_id;

  update public.catalog_sessions
     set customer_id=v_customer_id,
         metadata=(coalesce(v_session.metadata,'{}'::jsonb)
           -'web_pending_customer_id'
           -'web_pending_phone'
           -'web_verify_code'
           -'web_verify_expires_at'
           -'web_identity_verified_at'
           -'web_identity_verification_method')
           ||jsonb_build_object('web_customer_committed_at',now()),
         last_activity_at=now()
   where id=v_session.id;

  if v_session.cart_id is not null then
    update public.carts
       set customer_id=v_customer_id,updated_at=now()
     where id=v_session.cart_id and status='draft';
  end if;

  if v_session.conversation_id is not null then
    update public.conversations
       set customer_id=v_customer_id,wa_contact_e164=v_phone,updated_at=now()
     where id=v_session.conversation_id;
  end if;

  return jsonb_build_object('id',v_customer_id,'name',v_name,'phone',v_phone);
end;
$$;

revoke all on function public.room_commit_web_customer_v1(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.room_commit_web_customer_v1(text,uuid,text,text) to service_role;

commit;
