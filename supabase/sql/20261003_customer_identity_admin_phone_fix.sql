-- 2026-10-03
-- Clientes: resolver telefone BR sem escolher cadastro ambíguo, salvar edição do admin
-- de forma atômica e permitir exclusão definitiva preservando históricos de pedidos.

create or replace function public.customer_ids_by_phone_variants_v1(p_phone text)
returns table(customer_id uuid)
language sql
security definer
set search_path to ''
as $function$
  with vars as (
    select public.phone_variants_br(p_phone) as variants
  ), ids as (
    select c.id as customer_id
      from public.customers c, vars v
     where public.normalize_phone_digits(c.primary_whatsapp_e164)=any(v.variants)
    union
    select cp.customer_id
      from public.customer_phones cp, vars v
     where public.normalize_phone_digits(cp.phone_e164)=any(v.variants)
  )
  select customer_id from ids order by customer_id
$function$;

revoke all on function public.customer_ids_by_phone_variants_v1(text) from public, anon, authenticated;
grant execute on function public.customer_ids_by_phone_variants_v1(text) to service_role;

create or replace function public.resolve_customer_by_phone_v1(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_ids uuid[];
  v_count integer:=0;
begin
  if v_phone is null then
    return jsonb_build_object('ok',false,'match_status','invalid','error','invalid_phone');
  end if;

  select coalesce(array_agg(x.customer_id order by x.customer_id),array[]::uuid[])
    into v_ids
    from public.customer_ids_by_phone_variants_v1(v_phone) x;
  v_count:=coalesce(array_length(v_ids,1),0);

  if v_count=0 then
    return jsonb_build_object('ok',true,'match_status','none','canonical_phone_e164',v_phone,'candidate_count',0);
  elsif v_count=1 then
    return jsonb_build_object('ok',true,'match_status','matched','canonical_phone_e164',v_phone,'candidate_count',1,'customer_id',v_ids[1]);
  end if;

  return jsonb_build_object('ok',true,'match_status','ambiguous','canonical_phone_e164',v_phone,'candidate_count',v_count);
end;
$function$;

revoke all on function public.resolve_customer_by_phone_v1(text) from public, anon, authenticated;
grant execute on function public.resolve_customer_by_phone_v1(text) to service_role;

-- Lookup público consumido pelo storefront: só retorna cliente quando a identidade é única.
-- Nunca mais escolhe o primeiro UUID de um conjunto ambíguo.
create or replace function public.lookup_customer_by_phone(p_phone text)
returns table(customer_id uuid, bling_contact_id bigint, customer_name text, preferred_reply text)
language sql
security definer
set search_path to ''
as $function$
  with r as (
    select public.resolve_customer_by_phone_v1(p_phone) as j
  )
  select c.id,c.bling_contact_id,c.name,c.preferred_reply
    from r
    join public.customers c
      on (r.j->>'match_status')='matched'
     and c.id=(r.j->>'customer_id')::uuid
$function$;

-- Identidade do checkout: variante única reaproveita cadastro. Variante ambígua nunca cria
-- um cliente novo por conta própria; a etapa de registro pode usar o CPF para desambiguar.
create or replace function public.ensure_storefront_customer_v2(
  p_phone text,
  p_name text default null,
  p_source_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_resolved jsonb;
  v_customer_id uuid;
  v_created boolean:=false;
  v_status text:='verified_existing';
begin
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','invalid_phone');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:customer-phone:'||v_phone,0));
  v_resolved:=public.resolve_customer_by_phone_v1(v_phone);

  if v_resolved->>'match_status'='matched' then
    v_customer_id:=(v_resolved->>'customer_id')::uuid;
  elsif v_resolved->>'match_status'='ambiguous' then
    return jsonb_build_object(
      'ok',false,'error','ambiguous_phone','canonical_phone_e164',v_phone,
      'candidate_count',coalesce((v_resolved->>'candidate_count')::integer,0)
    );
  end if;

  if v_customer_id is null and v_name is null then
    return jsonb_build_object('ok',false,'error','customer_name_required','canonical_phone_e164',v_phone);
  end if;

  if v_customer_id is null then
    begin
      insert into public.customers(name,primary_whatsapp_e164,is_active,created_at,updated_at)
      values(v_name,v_phone,true,now(),now())
      returning id into v_customer_id;
      v_created:=true;
      v_status:='provisional';
    exception when unique_violation then
      v_resolved:=public.resolve_customer_by_phone_v1(v_phone);
      if v_resolved->>'match_status'='matched' then
        v_customer_id:=(v_resolved->>'customer_id')::uuid;
      else
        return jsonb_build_object('ok',false,'error','ambiguous_phone','canonical_phone_e164',v_phone);
      end if;
    end;
  else
    update public.customers
       set name=case when nullif(btrim(coalesce(name,'')),'') is null then v_name else name end,
           is_active=true,updated_at=now()
     where id=v_customer_id;
  end if;

  if not exists(
    select 1 from public.customer_phones cp
     where cp.customer_id=v_customer_id
       and public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
  ) then
    insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
    values(v_customer_id,v_phone,'whatsapp',true,case when v_created then null else now() end)
    on conflict(phone_e164) do nothing;
  end if;

  insert into public.customer_identity_profiles_v1(
    customer_id,identity_status,created_from,canonical_phone_e164,last_source_key,metadata,updated_at
  ) values(
    v_customer_id,
    case when v_created then 'provisional' else 'verified_existing' end,
    case when v_created then 'site_checkout' else 'existing' end,
    v_phone,nullif(left(coalesce(p_source_key,''),220),''),'{}'::jsonb,now()
  )
  on conflict(customer_id) do update set
    canonical_phone_e164=excluded.canonical_phone_e164,
    last_source_key=coalesce(excluded.last_source_key,public.customer_identity_profiles_v1.last_source_key),
    updated_at=now();

  select identity_status into v_status
    from public.customer_identity_profiles_v1 where customer_id=v_customer_id;

  return jsonb_build_object(
    'ok',true,'customer_id',v_customer_id,'created',v_created,'status',v_status,
    'canonical_phone_e164',v_phone,'ambiguous_variants_observed',false
  );
end;
$function$;

-- Registro do checkout: quando mais de um cadastro antigo compartilha variantes do mesmo
-- telefone, um CPF válido e pertencente a exatamente um desses candidatos desambigua com segurança.
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
as $function$
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
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_candidate_ids uuid[];
  v_doc_candidate_ids uuid[];
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
  if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;
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

  perform pg_advisory_xact_lock(hashtextextended('ops2:customer-phone:'||v_phone,0));
  select coalesce(array_agg(x.customer_id order by x.customer_id),array[]::uuid[])
    into v_candidate_ids
    from public.customer_ids_by_phone_variants_v1(v_phone) x;

  if coalesce(array_length(v_candidate_ids,1),0)>1 then
    select coalesce(array_agg(c.id order by c.id),array[]::uuid[])
      into v_doc_candidate_ids
      from public.customers c
     where c.id=any(v_candidate_ids)
       and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_document;

    if coalesce(array_length(v_doc_candidate_ids,1),0)=1 then
      v_customer_id:=v_doc_candidate_ids[1];
      v_identity:=jsonb_build_object(
        'ok',true,'customer_id',v_customer_id,'created',false,'status','verified_existing',
        'canonical_phone_e164',v_phone,'ambiguous_variants_observed',true
      );
    else
      return jsonb_build_object('ok',false,'error','ambiguous_phone','candidate_count',array_length(v_candidate_ids,1));
    end if;
  else
    v_identity:=public.ensure_storefront_customer_v2(v_phone,v_name,coalesce(nullif(p_source_key,''),'site_checkout'));
    if coalesce((v_identity->>'ok')::boolean,false) is not true then return v_identity; end if;
    v_customer_id:=(v_identity->>'customer_id')::uuid;
  end if;

  select regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),nullif(btrim(coalesce(c.name,'')),'')
    into v_existing_document,v_existing_name
    from public.customers c where c.id=v_customer_id;

  if public.ops2_valid_cpf_cnpj_v1(v_existing_document) and v_existing_document<>v_document then
    return jsonb_build_object('ok',false,'error','document_mismatch');
  end if;
  if not public.ops2_valid_cpf_cnpj_v1(v_existing_document)
     and v_existing_name is not null
     and lower(v_existing_name)<>lower(v_name) then
    return jsonb_build_object('ok',false,'error','identity_mismatch');
  end if;

  select c.id into v_doc_owner from public.customers c
   where c.id<>v_customer_id and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_document limit 1;
  if v_doc_owner is not null then return jsonb_build_object('ok',false,'error','document_already_in_use'); end if;

  update public.customers
     set name=v_name,cpf_cnpj=v_document,primary_whatsapp_e164=v_phone,
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
     set identity_status='verified_existing',canonical_phone_e164=v_phone,
         last_source_key=coalesce(nullif(left(p_source_key,220),''),last_source_key),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('site_registration_completed_at',now()),updated_at=now()
   where customer_id=v_customer_id;

  v_state:=public.ops2_customer_registration_state_v1(v_customer_id);
  if coalesce((v_state->>'registration_complete')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','registration_incomplete','customer_id',v_customer_id,'state',v_state);
  end if;

  v_job:=public.ops2_maybe_enqueue_customer_bling_v1(v_customer_id,'site_registration_completed');
  return jsonb_build_object('ok',true,'customer_id',v_customer_id,'canonical_phone_e164',v_phone,
    'registration_complete',true,'registration_state',v_state,'bling_job_id',v_job,
    'address',jsonb_build_object('id',v_address_id,'street',v_street,'number',v_number,'complement',v_complement,
      'neighborhood',v_neighborhood,'city',v_city,'state','MT','postal_code',v_postal_code,'reference',v_reference));
end;
$function$;

create or replace function public.ops2_admin_customer_save_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_payload->>'display_name',''),'\s+',' ','g')),180),'');
  v_phone_input text:=nullif(btrim(coalesce(p_payload->>'phone','')),'');
  v_phone text;
  v_cpf text:=nullif(left(regexp_replace(coalesce(p_payload->>'cpf',''),'[^0-9]','','g'),14),'');
  v_email text:=nullif(lower(left(btrim(coalesce(p_payload->>'email','')),180)),'');
  v_day integer;
  v_month integer;
  v_active boolean:=coalesce(p_payload->>'status','active') not in ('inactive','blocked');
  v_address jsonb:=coalesce(p_payload->'address','{}'::jsonb);
  v_has_address boolean;
  v_other uuid;
  v_phone_row uuid;
  v_same_phone_row uuid;
  v_email_row uuid;
  v_address_id uuid;
begin
  if v_name is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if nullif(p_payload->>'id','') is not null then
    begin v_id:=(p_payload->>'id')::uuid; exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','invalid_customer'); end;
    if not exists(select 1 from public.customers where id=v_id) then return jsonb_build_object('ok',false,'error','customer_not_found'); end if;
  end if;

  if v_phone_input is not null then
    v_phone:=public.canonical_whatsapp_e164_br_v2(v_phone_input);
    if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;
  end if;

  begin v_day:=nullif(p_payload->>'birthday_day','')::integer; exception when invalid_text_representation then v_day:=null; end;
  begin v_month:=nullif(p_payload->>'birthday_month','')::integer; exception when invalid_text_representation then v_month:=null; end;
  if v_day is not null and (v_day<1 or v_day>31) then v_day:=null; end if;
  if v_month is not null and (v_month<1 or v_month>12) then v_month:=null; end if;

  if v_phone is not null then
    select x.customer_id into v_other
      from public.customer_ids_by_phone_variants_v1(v_phone) x
     where v_id is null or x.customer_id<>v_id
     limit 1;
    if v_other is not null then return jsonb_build_object('ok',false,'error','phone_already_in_use'); end if;
  end if;

  if v_cpf is not null then
    select c.id into v_other from public.customers c
     where (v_id is null or c.id<>v_id)
       and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_cpf
     limit 1;
    if v_other is not null then return jsonb_build_object('ok',false,'error','cpf_already_in_use'); end if;
  end if;

  if v_id is null then
    insert into public.customers(name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,created_at,updated_at)
    values(v_name,v_cpf,v_phone,v_active,v_day,v_month,now(),now()) returning id into v_id;
  else
    update public.customers set
      name=v_name,cpf_cnpj=v_cpf,primary_whatsapp_e164=v_phone,is_active=v_active,
      birthday_day=v_day,birthday_month=v_month,updated_at=now()
    where id=v_id;
  end if;

  select cp.id into v_phone_row from public.customer_phones cp
   where cp.customer_id=v_id and cp.is_primary=true order by cp.created_at desc limit 1 for update;

  if v_phone is not null then
    select cp.id into v_same_phone_row from public.customer_phones cp
     where cp.customer_id=v_id and public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
     order by cp.created_at desc limit 1;
    update public.customer_phones set is_primary=false where customer_id=v_id and is_primary=true;
    if v_same_phone_row is not null then
      update public.customer_phones set phone_e164=v_phone,is_primary=true,source='vitrine_admin' where id=v_same_phone_row;
    elsif v_phone_row is not null then
      update public.customer_phones set phone_e164=v_phone,is_primary=true,source='vitrine_admin' where id=v_phone_row;
    else
      insert into public.customer_phones(customer_id,phone_e164,source,is_primary) values(v_id,v_phone,'vitrine_admin',true);
    end if;
  else
    update public.customer_phones set is_primary=false where customer_id=v_id and is_primary=true;
  end if;

  select ce.id into v_email_row from public.customer_emails ce
   where ce.customer_id=v_id order by ce.is_primary desc,ce.created_at desc limit 1 for update;
  update public.customer_emails set is_primary=false,updated_at=now() where customer_id=v_id and is_primary=true;
  if v_email is not null then
    if v_email_row is not null then
      update public.customer_emails set email=v_email,email_normalized=v_email,is_primary=true,source='vitrine_admin',updated_at=now() where id=v_email_row;
    else
      insert into public.customer_emails(customer_id,email,email_normalized,is_primary,source,updated_at)
      values(v_id,v_email,v_email,true,'vitrine_admin',now());
    end if;
  end if;

  v_has_address:=coalesce(nullif(btrim(v_address->>'postal_code'),''),nullif(btrim(v_address->>'street'),''),nullif(btrim(v_address->>'number'),''),nullif(btrim(v_address->>'district'),''),nullif(btrim(v_address->>'complement'),''),nullif(btrim(v_address->>'city'),''),nullif(btrim(v_address->>'state'),''),nullif(btrim(v_address->>'raw_text'),'')) is not null;
  select ca.id into v_address_id from public.customer_addresses ca
   where ca.customer_id=v_id and ca.is_default=true and ca.is_active=true order by ca.updated_at desc limit 1 for update;

  if v_address_id is not null then
    update public.customer_addresses set
      street=nullif(left(btrim(coalesce(v_address->>'street','')),180),''),
      number=nullif(left(btrim(coalesce(v_address->>'number','')),40),''),
      complement=nullif(left(btrim(coalesce(v_address->>'complement','')),140),''),
      neighborhood=nullif(left(btrim(coalesce(v_address->>'district','')),140),''),
      city=nullif(left(btrim(coalesce(v_address->>'city','')),120),''),
      state=nullif(upper(left(btrim(coalesce(v_address->>'state','')),2)),''),
      postal_code=nullif(left(regexp_replace(coalesce(v_address->>'postal_code',''),'[^0-9]','','g'),8),''),
      reference=nullif(left(btrim(coalesce(v_address->>'raw_text','')),400),''),
      is_default=v_has_address,is_active=v_has_address,updated_at=now()
    where id=v_address_id;
  elsif v_has_address then
    insert into public.customer_addresses(customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,created_at,updated_at)
    values(v_id,'Entrega',nullif(left(btrim(coalesce(v_address->>'street','')),180),''),nullif(left(btrim(coalesce(v_address->>'number','')),40),''),nullif(left(btrim(coalesce(v_address->>'complement','')),140),''),nullif(left(btrim(coalesce(v_address->>'district','')),140),''),nullif(left(btrim(coalesce(v_address->>'city','')),120),''),nullif(upper(left(btrim(coalesce(v_address->>'state','')),2)),''),nullif(left(regexp_replace(coalesce(v_address->>'postal_code',''),'[^0-9]','','g'),8),''),nullif(left(btrim(coalesce(v_address->>'raw_text','')),400),''),true,true,now(),now());
  end if;

  insert into public.customer_identity_profiles_v1(customer_id,identity_status,created_from,canonical_phone_e164,last_source_key,metadata,updated_at)
  values(v_id,'verified_existing','vitrine_admin',v_phone,'vitrine_admin','{}'::jsonb,now())
  on conflict(customer_id) do update set canonical_phone_e164=excluded.canonical_phone_e164,last_source_key='vitrine_admin',updated_at=now();

  return jsonb_build_object('ok',true,'customer_id',v_id);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','duplicate_customer_identity');
end;
$function$;

revoke all on function public.ops2_admin_customer_save_v2(jsonb) from public, anon, authenticated;
grant execute on function public.ops2_admin_customer_save_v2(jsonb) to service_role;

create or replace function public.ops2_admin_customer_delete_v1(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_orders integer:=0;
  v_carts integer:=0;
  v_conversations integer:=0;
begin
  if p_customer_id is null or not exists(select 1 from public.customers where id=p_customer_id) then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  update public.orders set customer_id=null,updated_at=now() where customer_id=p_customer_id;
  get diagnostics v_orders=row_count;
  update public.carts set customer_id=null,updated_at=now() where customer_id=p_customer_id;
  get diagnostics v_carts=row_count;
  update public.conversations set customer_id=null,updated_at=now() where customer_id=p_customer_id;
  get diagnostics v_conversations=row_count;

  delete from public.customers where id=p_customer_id;

  return jsonb_build_object(
    'ok',true,'deleted',true,
    'preserved_history',jsonb_build_object('orders',v_orders,'carts',v_carts,'conversations',v_conversations)
  );
end;
$function$;

revoke all on function public.ops2_admin_customer_delete_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_customer_delete_v1(uuid) to service_role;
