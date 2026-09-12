begin;

create or replace function public.deterministic_chat_attach_papoai_contact_v1(
  p_public_token text,
  p_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_contact_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_phone text:=public.canonical_phone_br(p_phone);
  v_variants text[]:=public.phone_variants_br(p_phone);
  v_matches uuid[];
  v_customer public.customers%rowtype;
  v_customer_id uuid;
  v_customer_found boolean:=false;
  v_customer_ambiguous boolean:=false;
  v_display_name text;
  v_state text;
begin
  select * into v_session
  from public.catalog_sessions
  where public_token=p_public_token
    and status='open'
    and expires_at>now()
  for update;

  if not found then raise exception 'room_unavailable'; end if;
  if v_phone is null or coalesce(array_length(v_variants,1),0)=0 then
    raise exception 'valid_whatsapp_required';
  end if;

  select array_agg(distinct id) into v_matches
  from (
    select c.id
    from public.customers c
    where c.is_active=true
      and public.normalize_phone_digits(c.primary_whatsapp_e164)=any(v_variants)
    union
    select cp.customer_id id
    from public.customer_phones cp
    join public.customers c on c.id=cp.customer_id and c.is_active=true
    where public.normalize_phone_digits(cp.phone_e164)=any(v_variants)
  ) q;

  if coalesce(array_length(v_matches,1),0)=1 then
    v_customer_id:=v_matches[1];
    select * into v_customer from public.customers where id=v_customer_id;
    v_customer_found:=true;
  elsif coalesce(array_length(v_matches,1),0)>1 then
    v_customer_ambiguous:=true;
  end if;

  v_display_name:=coalesce(
    case when v_customer_found then nullif(trim(v_customer.name),'') else null end,
    v_contact_name,
    'Cliente'
  );
  v_state:=coalesce(nullif(v_session.metadata->>'state',''),'MENU');

  update public.catalog_sessions
  set customer_id=case when v_customer_found then v_customer_id else customer_id end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'contact_name',v_contact_name,
        'display_name',v_display_name,
        'contact_phone',v_phone,
        'identity_source','papoai',
        'entry_source','papoai',
        'entry_channel','papoai',
        'customer_found',v_customer_found,
        'customer_ambiguous',v_customer_ambiguous
      ),
      last_activity_at=now()
  where id=v_session.id;

  update public.conversations
  set customer_id=case when v_customer_found then v_customer_id else customer_id end,
      wa_contact_e164=v_phone,
      referral=coalesce(referral,'{}'::jsonb)||jsonb_build_object(
        'entry_channel','papoai',
        'identity_source','papoai'
      ),
      updated_at=now()
  where id=v_session.conversation_id;

  if v_customer_found then
    update public.carts
    set customer_id=v_customer_id,
        updated_at=now()
    where conversation_id=v_session.conversation_id
      and status='draft';
  end if;

  insert into public.shopping_chat_trigger_events(
    catalog_session_id,conversation_id,customer_id,trigger,from_state,to_state,payload
  ) values(
    v_session.id,
    v_session.conversation_id,
    case when v_customer_found then v_customer_id else null end,
    'PAPOAI_CONTACT_ATTACHED',
    v_state,
    v_state,
    jsonb_build_object(
      'customer_found',v_customer_found,
      'customer_ambiguous',v_customer_ambiguous,
      'identity_source','papoai'
    )
  );

  return jsonb_build_object(
    'customer_found',v_customer_found,
    'customer_ambiguous',v_customer_ambiguous,
    'customer_id',case when v_customer_found then v_customer_id else null end,
    'customer_name',case when v_customer_found then nullif(trim(v_customer.name),'') else null end,
    'display_name',v_display_name,
    'contact_name',v_contact_name,
    'phone',v_phone,
    'conversation_id',v_session.conversation_id,
    'token',v_session.public_token
  );
end $$;

revoke all on function public.deterministic_chat_attach_papoai_contact_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.deterministic_chat_attach_papoai_contact_v1(text,text,text) to service_role;

commit;
