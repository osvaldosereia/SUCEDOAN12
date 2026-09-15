begin;

create or replace function public.room_save_address_v2(
  p_public_token text,
  p_address jsonb,
  p_mode text default 'add',
  p_address_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.catalog_sessions%rowtype;
  v_id uuid;
  v_mode text:=lower(trim(coalesce(p_mode,'add')));
  v_street text:=nullif(trim(coalesce(p_address->>'street','')),'');
  v_number text:=nullif(trim(coalesce(p_address->>'number','')),'');
  v_city text:=nullif(trim(coalesce(p_address->>'city','')),'');
  v_state text:=upper(coalesce(nullif(trim(p_address->>'state'),''),'MT'));
  v_label text:=coalesce(nullif(trim(p_address->>'label'),''),'Entrega');
begin
  select * into v_session
    from public.catalog_sessions
   where public_token=p_public_token
     and status='open'
     and expires_at>now()
   for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_session.customer_id is null then raise exception 'customer_identification_required'; end if;
  if v_street is null or v_number is null or v_city is null then raise exception 'delivery_address_required'; end if;
  if v_mode not in ('add','replace') then raise exception 'invalid_address_mode'; end if;

  update public.customer_addresses
     set is_default=false,updated_at=now()
   where customer_id=v_session.customer_id
     and is_active=true
     and is_default=true;

  if v_mode='replace' then
    if p_address_id is null then raise exception 'address_id_required'; end if;
    update public.customer_addresses
       set label=v_label,
           street=v_street,
           number=v_number,
           complement=nullif(trim(p_address->>'complement'),''),
           neighborhood=nullif(trim(p_address->>'neighborhood'),''),
           city=v_city,
           state=v_state,
           postal_code=regexp_replace(coalesce(p_address->>'postal_code',''),'[^0-9]','','g'),
           reference=nullif(trim(p_address->>'reference'),''),
           is_default=true,
           is_active=true,
           last_confirmed_at=now(),
           updated_at=now()
     where id=p_address_id
       and customer_id=v_session.customer_id
     returning id into v_id;
    if v_id is null then raise exception 'address_not_found'; end if;
  else
    insert into public.customer_addresses(
      customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,last_confirmed_at
    ) values (
      v_session.customer_id,v_label,v_street,v_number,
      nullif(trim(p_address->>'complement'),''),nullif(trim(p_address->>'neighborhood'),''),v_city,v_state,
      regexp_replace(coalesce(p_address->>'postal_code',''),'[^0-9]','','g'),nullif(trim(p_address->>'reference'),''),true,true,now()
    ) returning id into v_id;
  end if;

  update public.catalog_sessions set last_activity_at=now() where id=v_session.id;
  return jsonb_build_object('id',v_id,'saved',true,'mode',v_mode,'is_default',true);
end;
$$;

revoke all on function public.room_save_address_v2(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.room_save_address_v2(text,jsonb,text,uuid) to service_role;

commit;
