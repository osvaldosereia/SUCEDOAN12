-- Dona Antônia — site-only registration and checkout contract
-- 2026-09-30

create or replace function public.ops2_customer_registration_state_v1(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_customer public.customers%rowtype;
  v_phone text;
  v_name_ok boolean:=false;
  v_phone_ok boolean:=false;
  v_document_ok boolean:=false;
  v_has_street boolean:=false;
  v_has_number boolean:=false;
  v_has_neighborhood boolean:=false;
  v_has_city boolean:=false;
  v_registration_complete boolean:=false;
  v_already_linked_bling boolean:=false;
  v_bling_ready boolean:=false;
  v_document_only_pending boolean:=false;
  v_missing text[]:=array[]::text[];
begin
  select c.* into v_customer from public.customers c where c.id=p_customer_id;
  if not found then
    return jsonb_build_object(
      'ok',false,'error','customer_not_found','customer_id',p_customer_id,
      'identity_ready',false,'registration_complete',false,'bling_ready',false,
      'already_linked_bling',false,'flow_required',false,'document_only_pending',false,
      'missing_fields',to_jsonb(array['name','phone','document','address','number','neighborhood','city']::text[])
    );
  end if;

  v_name_ok:=nullif(btrim(coalesce(v_customer.name,'')),'') is not null;
  v_phone:=public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164);
  v_phone_ok:=v_phone is not null;
  v_document_ok:=public.ops2_valid_cpf_cnpj_v1(v_customer.cpf_cnpj);

  select
    coalesce(bool_or(nullif(btrim(coalesce(a.street,'')),'') is not null),false),
    coalesce(bool_or(nullif(btrim(coalesce(a.number,'')),'') is not null),false),
    coalesce(bool_or(nullif(btrim(coalesce(a.neighborhood,'')),'') is not null),false),
    coalesce(bool_or(nullif(btrim(coalesce(a.city,'')),'') is not null),false)
  into v_has_street,v_has_number,v_has_neighborhood,v_has_city
  from public.customer_addresses a
  where a.customer_id=p_customer_id and a.is_active=true;

  v_registration_complete:=v_name_ok and v_phone_ok and v_document_ok
    and v_has_street and v_has_number and v_has_neighborhood and v_has_city;
  v_already_linked_bling:=coalesce(v_customer.bling_contact_id,0)>0;
  v_bling_ready:=v_already_linked_bling or v_registration_complete;

  if not v_name_ok then v_missing:=array_append(v_missing,'name'); end if;
  if not v_phone_ok then v_missing:=array_append(v_missing,'phone'); end if;
  if not v_document_ok then v_missing:=array_append(v_missing,'document'); end if;
  if not v_has_street then v_missing:=array_append(v_missing,'address'); end if;
  if not v_has_number then v_missing:=array_append(v_missing,'number'); end if;
  if not v_has_neighborhood then v_missing:=array_append(v_missing,'neighborhood'); end if;
  if not v_has_city then v_missing:=array_append(v_missing,'city'); end if;

  v_document_only_pending:=v_name_ok and v_phone_ok and v_has_street and v_has_number
    and v_has_neighborhood and v_has_city and not v_document_ok;

  return jsonb_build_object(
    'ok',true,'customer_id',p_customer_id,
    'identity_ready',v_name_ok and v_phone_ok,
    'registration_complete',v_registration_complete,
    'bling_ready',v_bling_ready,
    'already_linked_bling',v_already_linked_bling,
    'flow_required',false,
    'document_only_pending',v_document_only_pending,
    'missing_fields',to_jsonb(v_missing)
  );
end;
$$;

revoke all on function public.ops2_customer_registration_state_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_customer_registration_state_v1(uuid) to service_role;

create or replace function public.ops2_upsert_storefront_registration_v1(
  p_phone text,
  p_name text,
  p_document text,
  p_street text,
  p_number text,
  p_neighborhood text,
  p_city text,
  p_complement text default null,
  p_reference text default null,
  p_postal_code text default null,
  p_marketing_opt_in boolean default null,
  p_source_key text default 'site_checkout'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_document text:=regexp_replace(coalesce(p_document,''),'[^0-9]','','g');
  v_street text:=nullif(left(btrim(regexp_replace(coalesce(p_street,''),'\s+',' ','g')),180),'');
  v_number text:=nullif(left(btrim(regexp_replace(coalesce(p_number,''),'\s+',' ','g')),40),'');
  v_neighborhood text:=nullif(left(btrim(regexp_replace(coalesce(p_neighborhood,''),'\s+',' ','g')),120),'');
  v_city_input text:=nullif(left(btrim(regexp_replace(coalesce(p_city,''),'\s+',' ','g')),100),'');
  v_city_key text;
  v_city text;
  v_complement text:=nullif(left(btrim(regexp_replace(coalesce(p_complement,''),'\s+',' ','g')),180),'');
  v_reference text:=nullif(left(btrim(regexp_replace(coalesce(p_reference,''),'\s+',' ','g')),220),'');
  v_postal_code text:=nullif(left(regexp_replace(coalesce(p_postal_code,''),'[^0-9]','','g'),8),'');
  v_identity jsonb;
  v_customer_id uuid;
  v_doc_owner uuid;
  v_address_id uuid;
  v_state jsonb;
  v_job uuid;
begin
  if v_name is null or char_length(v_name)<2 then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if not public.ops2_valid_cpf_cnpj_v1(v_document) then return jsonb_build_object('ok',false,'error','invalid_document'); end if;
  if v_street is null then return jsonb_build_object('ok',false,'error','street_required'); end if;
  if v_number is null then return jsonb_build_object('ok',false,'error','number_required'); end if;
  if v_neighborhood is null then return jsonb_build_object('ok',false,'error','neighborhood_required'); end if;
  if v_city_input is null then return jsonb_build_object('ok',false,'error','city_required'); end if;

  v_city_key:=translate(lower(v_city_input),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  if v_city_key='cuiaba' then v_city:='Cuiabá';
  elsif v_city_key='varzea grande' then v_city:='Várzea Grande';
  else return jsonb_build_object('ok',false,'error','unsupported_city','allowed_cities',jsonb_build_array('Cuiabá','Várzea Grande'));
  end if;

  v_identity:=public.ensure_storefront_customer_v2(p_phone,v_name,coalesce(nullif(p_source_key,''),'site_checkout'));
  if coalesce((v_identity->>'ok')::boolean,false) is not true then return v_identity; end if;
  v_customer_id:=(v_identity->>'customer_id')::uuid;

  select c.id into v_doc_owner
  from public.customers c
  where c.id<>v_customer_id
    and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_document
  limit 1;
  if v_doc_owner is not null then return jsonb_build_object('ok',false,'error','document_already_in_use'); end if;

  update public.customers
     set name=v_name,
         cpf_cnpj=v_document,
         marketing_opt_in=case when p_marketing_opt_in is null then marketing_opt_in else p_marketing_opt_in end,
         marketing_consent_updated_at=case when p_marketing_opt_in is null then marketing_consent_updated_at else now() end,
         is_active=true,
         updated_at=now()
   where id=v_customer_id;

  select a.id into v_address_id
  from public.customer_addresses a
  where a.customer_id=v_customer_id and a.is_active=true
  order by a.is_default desc,a.updated_at desc,a.id
  limit 1
  for update;

  update public.customer_addresses set is_default=false,updated_at=now()
  where customer_id=v_customer_id and is_active=true and id is distinct from v_address_id;

  if v_address_id is null then
    insert into public.customer_addresses(
      customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,
      is_default,is_active,last_confirmed_at,created_at,updated_at
    ) values(
      v_customer_id,'Entrega',v_street,v_number,v_complement,v_neighborhood,v_city,'MT',v_postal_code,v_reference,
      true,true,now(),now(),now()
    ) returning id into v_address_id;
  else
    update public.customer_addresses
       set label=coalesce(nullif(label,''),'Entrega'),street=v_street,number=v_number,complement=v_complement,
           neighborhood=v_neighborhood,city=v_city,state='MT',postal_code=v_postal_code,reference=v_reference,
           is_default=true,is_active=true,last_confirmed_at=now(),google_maps_url=null,latitude=null,longitude=null,updated_at=now()
     where id=v_address_id;
  end if;

  update public.customer_identity_profiles_v1
     set identity_status='verified_existing',
         last_source_key=coalesce(nullif(left(p_source_key,220),''),last_source_key),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('site_registration_completed_at',now()),
         updated_at=now()
   where customer_id=v_customer_id;

  v_state:=public.ops2_customer_registration_state_v1(v_customer_id);
  if coalesce((v_state->>'registration_complete')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','registration_incomplete','customer_id',v_customer_id,'state',v_state);
  end if;

  v_job:=public.ops2_maybe_enqueue_customer_bling_v1(v_customer_id,'site_registration_completed');

  return jsonb_build_object(
    'ok',true,'customer_id',v_customer_id,'canonical_phone_e164',v_identity->>'canonical_phone_e164',
    'registration_complete',true,'registration_state',v_state,'bling_job_id',v_job,
    'address',jsonb_build_object('id',v_address_id,'street',v_street,'number',v_number,'complement',v_complement,
      'neighborhood',v_neighborhood,'city',v_city,'state','MT','postal_code',v_postal_code,'reference',v_reference)
  );
end;
$$;

revoke all on function public.ops2_upsert_storefront_registration_v1(text,text,text,text,text,text,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.ops2_upsert_storefront_registration_v1(text,text,text,text,text,text,text,text,text,text,boolean,text) to service_role;

-- Flow is retired for new registrations. Keep functions/tables for audit only.
alter table public.papoai_webhook_inbox_v2 disable trigger trg_ops2_auto_process_papoai_flow_v2;
alter table public.ops2_customer_registration_journeys_v1 disable trigger trg_ops2_registration_journey_outbound_intent_v1;
