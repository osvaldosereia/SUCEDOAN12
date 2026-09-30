-- Dona Antônia — guard public registration updates for existing customers
-- Applied to canonical Supabase 2026-09-30.
-- Existing customers with a valid CPF/CNPJ must submit the same document to alter registration data.
-- Existing incomplete customers without a valid document must at least match the saved name.

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
  v_existing_document text;
  v_existing_name text;
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

  select regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),nullif(btrim(coalesce(c.name,'')),'')
    into v_existing_document,v_existing_name from public.customers c where c.id=v_customer_id;
  if public.ops2_valid_cpf_cnpj_v1(v_existing_document) and v_existing_document<>v_document then
    return jsonb_build_object('ok',false,'error','document_mismatch');
  end if;
  if not public.ops2_valid_cpf_cnpj_v1(v_existing_document) and v_existing_name is not null and lower(v_existing_name)<>lower(v_name) then
    return jsonb_build_object('ok',false,'error','identity_mismatch');
  end if;

  select c.id into v_doc_owner from public.customers c
  where c.id<>v_customer_id and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_document limit 1;
  if v_doc_owner is not null then return jsonb_build_object('ok',false,'error','document_already_in_use'); end if;

  update public.customers
     set name=v_name,cpf_cnpj=v_document,
         marketing_opt_in=case when p_marketing_opt_in is null then marketing_opt_in else p_marketing_opt_in end,
         marketing_consent_updated_at=case when p_marketing_opt_in is null then marketing_consent_updated_at else now() end,
         is_active=true,updated_at=now()
   where id=v_customer_id;

  select a.id into v_address_id from public.customer_addresses a
  where a.customer_id=v_customer_id and a.is_active=true
  order by a.is_default desc,a.updated_at desc,a.id limit 1 for update;
  update public.customer_addresses set is_default=false,updated_at=now()
  where customer_id=v_customer_id and is_active=true and id is distinct from v_address_id;

  if v_address_id is null then
    insert into public.customer_addresses(customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,last_confirmed_at,created_at,updated_at)
    values(v_customer_id,'Entrega',v_street,v_number,v_complement,v_neighborhood,v_city,'MT',v_postal_code,v_reference,true,true,now(),now(),now())
    returning id into v_address_id;
  else
    update public.customer_addresses
       set label=coalesce(nullif(label,''),'Entrega'),street=v_street,number=v_number,complement=v_complement,
           neighborhood=v_neighborhood,city=v_city,state='MT',postal_code=v_postal_code,reference=v_reference,
           is_default=true,is_active=true,last_confirmed_at=now(),google_maps_url=null,latitude=null,longitude=null,updated_at=now()
     where id=v_address_id;
  end if;

  update public.customer_identity_profiles_v1
     set identity_status='verified_existing',last_source_key=coalesce(nullif(left(p_source_key,220),''),last_source_key),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('site_registration_completed_at',now()),updated_at=now()
   where customer_id=v_customer_id;

  v_state:=public.ops2_customer_registration_state_v1(v_customer_id);
  if coalesce((v_state->>'registration_complete')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','registration_incomplete','customer_id',v_customer_id,'state',v_state);
  end if;
  v_job:=public.ops2_maybe_enqueue_customer_bling_v1(v_customer_id,'site_registration_completed');
  return jsonb_build_object('ok',true,'customer_id',v_customer_id,'canonical_phone_e164',v_identity->>'canonical_phone_e164',
    'registration_complete',true,'registration_state',v_state,'bling_job_id',v_job,
    'address',jsonb_build_object('id',v_address_id,'street',v_street,'number',v_number,'complement',v_complement,
      'neighborhood',v_neighborhood,'city',v_city,'state','MT','postal_code',v_postal_code,'reference',v_reference));
end;
$$;

revoke all on function public.ops2_upsert_storefront_registration_v1(text,text,text,text,text,text,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.ops2_upsert_storefront_registration_v1(text,text,text,text,text,text,text,text,text,text,boolean,text) to service_role;
