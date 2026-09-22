begin;

alter table public.whatsapp_sales_state
  add column if not exists pending_name text;

create or replace function public.get_papoai_commerce_checkout_profile_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_contact jsonb;
  v_state public.whatsapp_sales_state%rowtype;
  v_name text;
  v_address jsonb;
  v_missing text[]:='{}'::text[];
  v_city text;
begin
  v_contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);

  select * into v_state
  from public.whatsapp_sales_state
  where conversation_id=p_conversation_id;

  v_name:=coalesce(
    nullif(trim(v_state.pending_name),''),
    nullif(trim(v_contact->>'person_name'),''),
    nullif(trim(v_contact->>'name'),'')
  );

  v_address:=coalesce(v_state.pending_delivery_address,'{}'::jsonb)
    || coalesce(v_contact->'address','{}'::jsonb);

  if v_state.pending_delivery_address is not null
     and jsonb_typeof(v_state.pending_delivery_address)='object'
     and v_state.pending_delivery_address<>'{}'::jsonb
  then
    v_address:=coalesce(v_contact->'address','{}'::jsonb)
      || v_state.pending_delivery_address;
  end if;

  v_city:=public.normalize_local_delivery_city_v1(v_address->>'city');

  if v_name is null then v_missing:=array_append(v_missing,'name'); end if;
  if nullif(trim(coalesce(v_address->>'street','')),'') is null then v_missing:=array_append(v_missing,'street'); end if;
  if nullif(trim(coalesce(v_address->>'number','')),'') is null then v_missing:=array_append(v_missing,'number'); end if;
  if nullif(trim(coalesce(v_address->>'neighborhood','')),'') is null then v_missing:=array_append(v_missing,'neighborhood'); end if;
  if v_city is null then v_missing:=array_append(v_missing,'city'); end if;

  if v_city is not null then
    v_address:=v_address||jsonb_build_object('city',v_city,'state','MT');
  end if;

  return jsonb_build_object(
    'complete',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing),
    'name',v_name,
    'address',v_address,
    'known_customer',coalesce((v_contact->>'known_customer')::boolean,false),
    'writes_performed',false
  );
end;
$$;

create or replace function public.begin_papoai_commerce_checkout_profile_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_profile jsonb;
  v_missing jsonb;
  v_prompt text;
begin
  v_profile:=public.get_papoai_commerce_checkout_profile_v1(p_conversation_id);
  v_missing:=coalesce(v_profile->'missing','[]'::jsonb);

  insert into public.whatsapp_sales_state(conversation_id,awaiting,last_action)
  values(p_conversation_id,'checkout_profile','checkout_profile_requested')
  on conflict(conversation_id) do update set
    awaiting='checkout_profile',
    last_action='checkout_profile_requested',
    updated_at=now();

  if coalesce((v_profile->>'complete')::boolean,false) then
    v_prompt:='Seu cadastro de entrega já está completo.';
  elsif v_missing ? 'name' then
    v_prompt:='Para finalizar, me envie em uma única mensagem seu nome e endereço de entrega: rua, número, bairro e cidade.';
  else
    v_prompt:='Para finalizar, me envie em uma única mensagem o endereço de entrega: rua, número, bairro e cidade.';
  end if;

  return v_profile||jsonb_build_object(
    'awaiting','checkout_profile',
    'prompt',v_prompt
  );
end;
$$;

create or replace function public.save_papoai_commerce_checkout_profile_pending_v1(
  p_conversation_id uuid,
  p_name text,
  p_street text,
  p_number text,
  p_complement text,
  p_neighborhood text,
  p_city text,
  p_postal_code text default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_city text;
  v_state public.whatsapp_sales_state%rowtype;
  v_existing jsonb;
  v_address jsonb;
  v_name text;
  v_cep text;
  v_profile jsonb;
begin
  if not exists(select 1 from public.conversations where id=p_conversation_id) then
    raise exception 'conversation_not_found';
  end if;

  v_city:=public.normalize_local_delivery_city_v1(p_city);
  if v_city is null then
    return jsonb_build_object(
      'ok',false,
      'reason','delivery_city_not_supported',
      'supported_cities',jsonb_build_array('Cuiabá','Várzea Grande')
    );
  end if;

  if nullif(trim(coalesce(p_street,'')),'') is null
     or nullif(trim(coalesce(p_number,'')),'') is null
     or nullif(trim(coalesce(p_neighborhood,'')),'') is null
  then
    return jsonb_build_object('ok',false,'reason','address_incomplete');
  end if;

  v_cep:=regexp_replace(coalesce(p_postal_code,''),'[^0-9]','','g');
  if v_cep<>'' and length(v_cep)<>8 then
    return jsonb_build_object('ok',false,'reason','invalid_postal_code');
  end if;

  insert into public.whatsapp_sales_state(conversation_id)
  values(p_conversation_id)
  on conflict(conversation_id) do nothing;

  select * into v_state
  from public.whatsapp_sales_state
  where conversation_id=p_conversation_id
  for update;

  v_existing:=coalesce(v_state.pending_delivery_address,'{}'::jsonb);
  v_name:=coalesce(
    nullif(trim(coalesce(p_name,'')),''),
    nullif(trim(coalesce(v_state.pending_name,'')),'')
  );

  v_address:=v_existing||jsonb_strip_nulls(jsonb_build_object(
    'street',nullif(trim(coalesce(p_street,'')),''),
    'number',nullif(trim(coalesce(p_number,'')),''),
    'complement',nullif(trim(coalesce(p_complement,'')),''),
    'neighborhood',nullif(trim(coalesce(p_neighborhood,'')),''),
    'city',v_city,
    'state','MT',
    'postal_code',nullif(v_cep,''),
    'reference',nullif(trim(coalesce(p_reference,'')),'')
  ));

  update public.whatsapp_sales_state
     set pending_name=v_name,
         pending_delivery_address=v_address,
         awaiting=null,
         last_action='checkout_profile_captured',
         updated_at=now()
   where conversation_id=p_conversation_id;

  v_profile:=public.get_papoai_commerce_checkout_profile_v1(p_conversation_id);

  return jsonb_build_object(
    'ok',coalesce((v_profile->>'complete')::boolean,false),
    'profile',v_profile,
    'persisted_to_customer',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_checkout_profile_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_checkout_profile_v1(uuid) to service_role;

revoke all on function public.begin_papoai_commerce_checkout_profile_v1(uuid) from public,anon,authenticated;
grant execute on function public.begin_papoai_commerce_checkout_profile_v1(uuid) to service_role;

revoke all on function public.save_papoai_commerce_checkout_profile_pending_v1(uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_papoai_commerce_checkout_profile_pending_v1(uuid,text,text,text,text,text,text,text,text) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'checkout_profile_capture_version','v1',
  'checkout_profile_max_questions',2,
  'checkout_profile_persist_after_order_confirmation',true
),
updated_at=now()
where id=1;

commit;
