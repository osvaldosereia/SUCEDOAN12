-- Customer multi-address support: keep one customer identity and add managed delivery addresses.
with ranked as (
  select
    id,
    row_number() over (
      partition by customer_id
      order by is_default desc, updated_at desc, created_at asc, id
    ) as position
  from public.customer_addresses
  where is_active = true
)
update public.customer_addresses a
set is_default = (r.position = 1),
    updated_at = clock_timestamp()
from ranked r
where a.id = r.id
  and a.is_default is distinct from (r.position = 1);

update public.customer_addresses
set is_default = false,
    updated_at = clock_timestamp()
where is_active = false
  and is_default = true;

create unique index if not exists ux_customer_addresses_one_active_default_v1
  on public.customer_addresses (customer_id)
  where is_active = true and is_default = true;

create or replace function public.ops3_site_admin_customer_address_manage_v1(
  p_action text,
  p_customer_id uuid,
  p_address_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_label text default null,
  p_address jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_label text := left(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), 60);
  v_street text := left(btrim(regexp_replace(coalesce(p_address->>'street', ''), '\s+', ' ', 'g')), 180);
  v_number text := left(btrim(regexp_replace(coalesce(p_address->>'number', ''), '\s+', ' ', 'g')), 40);
  v_complement text := nullif(left(btrim(regexp_replace(coalesce(p_address->>'complement', ''), '\s+', ' ', 'g')), 180), '');
  v_neighborhood text := left(btrim(regexp_replace(coalesce(p_address->>'neighborhood', ''), '\s+', ' ', 'g')), 120);
  v_city_input text := left(btrim(regexp_replace(coalesce(p_address->>'city', ''), '\s+', ' ', 'g')), 100);
  v_city_key text;
  v_city text;
  v_state text := upper(left(btrim(coalesce(p_address->>'state', 'MT')), 2));
  v_postal_code text := nullif(left(regexp_replace(coalesce(p_address->>'postal_code', ''), '[^0-9]', '', 'g'), 8), '');
  v_reference text := nullif(left(btrim(regexp_replace(coalesce(p_address->>'reference', ''), '\s+', ' ', 'g')), 220), '');
  v_id uuid;
  v_was_default boolean := false;
  v_replacement uuid;
  v_customer_found boolean := false;
  v_row public.customer_addresses%rowtype;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_id');
  end if;

  perform 1 from public.customers c
   where c.id = p_customer_id and c.is_active = true
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  if v_action in ('create', 'update') then
    if length(v_label) < 1 then
      return jsonb_build_object('ok', false, 'error', 'address_label_required');
    end if;
    if v_street = '' or v_number = '' or v_neighborhood = '' or v_city_input = '' or length(v_state) <> 2 then
      return jsonb_build_object('ok', false, 'error', 'invalid_customer_address');
    end if;

    v_city_key := translate(lower(v_city_input), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
    if v_city_key = 'cuiaba' then
      v_city := 'Cuiabá';
    elsif v_city_key = 'varzea grande' then
      v_city := 'Várzea Grande';
    else
      return jsonb_build_object('ok', false, 'error', 'unsupported_city');
    end if;

    if v_action = 'create' then
      select a.id into v_id
        from public.customer_addresses a
       where a.customer_id = p_customer_id
         and a.is_active = true
         and lower(btrim(a.street)) = lower(v_street)
         and lower(btrim(a.number)) = lower(v_number)
         and lower(btrim(coalesce(a.complement, ''))) = lower(coalesce(v_complement, ''))
         and lower(btrim(a.neighborhood)) = lower(v_neighborhood)
         and lower(btrim(a.city)) = lower(v_city)
       order by a.is_default desc, a.created_at asc
       limit 1
       for update;
      if v_id is not null then
        select * into v_row from public.customer_addresses where id = v_id;
        return jsonb_build_object('ok', true, 'created', false, 'address', jsonb_build_object(
          'id', v_row.id, 'label', v_row.label, 'street', v_row.street, 'number', v_row.number,
          'complement', v_row.complement, 'neighborhood', v_row.neighborhood, 'city', v_row.city,
          'state', v_row.state, 'postal_code', v_row.postal_code, 'reference', v_row.reference,
          'is_default', v_row.is_default, 'is_active', v_row.is_active, 'updated_at', v_row.updated_at
        ));
      end if;

      select not exists (
        select 1 from public.customer_addresses a
        where a.customer_id = p_customer_id and a.is_active = true
      ) into v_customer_found;
      insert into public.customer_addresses (
        customer_id, label, street, number, complement, neighborhood, city, state,
        postal_code, reference, is_default, is_active, last_confirmed_at, created_at, updated_at
      ) values (
        p_customer_id, v_label, v_street, v_number, v_complement, v_neighborhood, v_city, v_state,
        v_postal_code, v_reference, v_customer_found, true, clock_timestamp(), clock_timestamp(), clock_timestamp()
      ) returning id into v_id;
    else
      if p_address_id is null or p_expected_updated_at is null then
        return jsonb_build_object('ok', false, 'error', 'invalid_address_snapshot');
      end if;
      select a.is_default into v_was_default
        from public.customer_addresses a
       where a.id = p_address_id and a.customer_id = p_customer_id and a.is_active = true
       for update;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'customer_address_not_found');
      end if;
      if not exists (
        select 1 from public.customer_addresses a
        where a.id = p_address_id and a.customer_id = p_customer_id and a.updated_at = p_expected_updated_at
      ) then
        return jsonb_build_object('ok', false, 'error', 'address_changed');
      end if;
      update public.customer_addresses
         set label = v_label, street = v_street, number = v_number, complement = v_complement,
             neighborhood = v_neighborhood, city = v_city, state = v_state,
             postal_code = v_postal_code, reference = v_reference, updated_at = clock_timestamp()
       where id = p_address_id and customer_id = p_customer_id
       returning id into v_id;
    end if;
  elsif v_action = 'set_default' then
    if p_address_id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_address_id');
    end if;
    select a.id into v_replacement
      from public.customer_addresses a
     where a.id = p_address_id and a.customer_id = p_customer_id and a.is_active = true
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'customer_address_not_found');
    end if;
    update public.customer_addresses
       set is_default = false, updated_at = clock_timestamp()
     where customer_id = p_customer_id and is_active = true and id <> p_address_id and is_default = true;
    update public.customer_addresses
       set is_default = true, updated_at = clock_timestamp()
     where id = p_address_id and customer_id = p_customer_id and is_active = true
     returning id into v_id;
  elsif v_action = 'deactivate' then
    if p_address_id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_address_id');
    end if;
    select a.is_default into v_was_default
      from public.customer_addresses a
     where a.id = p_address_id and a.customer_id = p_customer_id and a.is_active = true
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'customer_address_not_found');
    end if;
    update public.customer_addresses
       set is_active = false, is_default = false, updated_at = clock_timestamp()
     where id = p_address_id and customer_id = p_customer_id
     returning id into v_id;
    if v_was_default then
      select a.id into v_replacement
        from public.customer_addresses a
       where a.customer_id = p_customer_id and a.is_active = true
       order by a.created_at asc, a.id
       limit 1
       for update;
      if v_replacement is not null then
        update public.customer_addresses
           set is_default = true, updated_at = clock_timestamp()
         where id = v_replacement;
      end if;
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_address_action');
  end if;

  select * into v_row from public.customer_addresses where id = v_id;
  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (
    null,
    'customer_address_' || v_action,
    'customer_address',
    v_id::text,
    jsonb_build_object(
      'source', 'site_admin_code',
      'customer_id', p_customer_id,
      'label', v_row.label,
      'is_default', v_row.is_default,
      'is_active', v_row.is_active
    )
  );

  return jsonb_build_object('ok', true, 'created', v_action = 'create', 'address', jsonb_build_object(
    'id', v_row.id, 'label', v_row.label, 'street', v_row.street, 'number', v_row.number,
    'complement', v_row.complement, 'neighborhood', v_row.neighborhood, 'city', v_row.city,
    'state', v_row.state, 'postal_code', v_row.postal_code, 'reference', v_row.reference,
    'is_default', v_row.is_default, 'is_active', v_row.is_active, 'updated_at', v_row.updated_at
  ));
end;
$function$;

create or replace function public.ops3_storefront_customer_document_bind_v1(
  p_customer_id uuid,
  p_phone text,
  p_document text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phone text := btrim(coalesce(p_phone, ''));
  v_document text := regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g');
  v_existing_document text;
begin
  if p_customer_id is null or v_phone !~ '^\+55[1-9][0-9]{9,10}$'
     or not public.ops2_valid_cpf_cnpj_v1(v_document) then
    return jsonb_build_object('ok', false, 'error', 'invalid_document_confirmation');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops3:customer-document:' || v_document, 0));
  select regexp_replace(coalesce(c.cpf_cnpj, ''), '[^0-9]', '', 'g')
    into v_existing_document
    from public.customers c
   where c.id = p_customer_id and c.is_active = true
     and (
       public.normalize_phone_digits(c.primary_whatsapp_e164) = public.normalize_phone_digits(v_phone)
       or exists (
         select 1 from public.customer_phones cp
         where cp.customer_id = c.id
           and public.normalize_phone_digits(cp.phone_e164) = public.normalize_phone_digits(v_phone)
       )
     )
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  if coalesce(v_existing_document, '') <> '' then
    if v_existing_document = v_document then
      return jsonb_build_object('ok', true, 'already_bound', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'document_mismatch');
  end if;
  if exists (
    select 1 from public.customers c
    where c.id <> p_customer_id
      and regexp_replace(coalesce(c.cpf_cnpj, ''), '[^0-9]', '', 'g') = v_document
  ) then
    return jsonb_build_object('ok', false, 'error', 'document_already_in_use');
  end if;

  update public.customers
     set cpf_cnpj = v_document, updated_at = clock_timestamp()
   where id = p_customer_id and is_active = true;
  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (null, 'customer_document_confirmed_checkout', 'customer', p_customer_id::text,
    jsonb_build_object('source', 'storefront_checkout', 'document_last4', right(v_document, 4)));
  return jsonb_build_object('ok', true, 'already_bound', false);
end;
$function$;

create or replace function public.ops3_storefront_customer_address_add_v1(
  p_customer_id uuid,
  p_phone text,
  p_document_last4 text,
  p_label text,
  p_address jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phone text := btrim(coalesce(p_phone, ''));
  v_last4 text := regexp_replace(coalesce(p_document_last4, ''), '[^0-9]', '', 'g');
  v_label text := left(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), 60);
  v_street text := left(btrim(regexp_replace(coalesce(p_address->>'street', ''), '\s+', ' ', 'g')), 180);
  v_number text := left(btrim(regexp_replace(coalesce(p_address->>'number', ''), '\s+', ' ', 'g')), 40);
  v_complement text := nullif(left(btrim(regexp_replace(coalesce(p_address->>'complement', ''), '\s+', ' ', 'g')), 180), '');
  v_neighborhood text := left(btrim(regexp_replace(coalesce(p_address->>'neighborhood', ''), '\s+', ' ', 'g')), 120);
  v_city_input text := left(btrim(regexp_replace(coalesce(p_address->>'city', ''), '\s+', ' ', 'g')), 100);
  v_city_key text;
  v_city text;
  v_postal_code text := nullif(left(regexp_replace(coalesce(p_address->>'postal_code', ''), '[^0-9]', '', 'g'), 8), '');
  v_reference text := nullif(left(btrim(regexp_replace(coalesce(p_address->>'reference', ''), '\s+', ' ', 'g')), 220), '');
  v_doc text;
  v_default boolean;
  v_phone_matches boolean;
  v_address_id uuid;
  v_row public.customer_addresses%rowtype;
begin
  if p_customer_id is null or v_phone !~ '^\+55[1-9][0-9]{9,10}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer');
  end if;
  if length(v_last4) <> 4 or length(v_label) < 1 then
    return jsonb_build_object('ok', false, 'error', 'document_confirmation_required');
  end if;
  if v_street = '' or v_number = '' or v_neighborhood = '' or v_city_input = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_address');
  end if;

  v_city_key := translate(lower(v_city_input), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  if v_city_key = 'cuiaba' then
    v_city := 'Cuiabá';
  elsif v_city_key = 'varzea grande' then
    v_city := 'Várzea Grande';
  else
    return jsonb_build_object('ok', false, 'error', 'unsupported_city');
  end if;

  perform 1 from public.customers c
   where c.id = p_customer_id and c.is_active = true
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;
  select public.normalize_phone_digits(c.primary_whatsapp_e164) = public.normalize_phone_digits(v_phone)
      or exists (
        select 1 from public.customer_phones cp
        where cp.customer_id = c.id
          and public.normalize_phone_digits(cp.phone_e164) = public.normalize_phone_digits(v_phone)
      )
    into v_phone_matches
    from public.customers c
   where c.id = p_customer_id and c.is_active = true;
  if not coalesce(v_phone_matches, false) then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  select regexp_replace(coalesce(c.cpf_cnpj, ''), '[^0-9]', '', 'g')
    into v_doc from public.customers c where c.id = p_customer_id;
  if length(coalesce(v_doc, '')) not in (11, 14) or right(v_doc, 4) <> v_last4 then
    return jsonb_build_object('ok', false, 'error', 'document_mismatch');
  end if;

  select a.id into v_address_id
    from public.customer_addresses a
   where a.customer_id = p_customer_id and a.is_active = true
     and lower(btrim(a.street)) = lower(v_street)
     and lower(btrim(a.number)) = lower(v_number)
     and lower(btrim(coalesce(a.complement, ''))) = lower(coalesce(v_complement, ''))
     and lower(btrim(a.neighborhood)) = lower(v_neighborhood)
     and lower(btrim(a.city)) = lower(v_city)
   order by a.is_default desc, a.created_at asc
   limit 1
   for update;
  if v_address_id is not null then
    select * into v_row from public.customer_addresses where id = v_address_id;
    return jsonb_build_object('ok', true, 'created', false, 'address', jsonb_build_object(
      'id', v_row.id, 'label', v_row.label, 'street', v_row.street, 'number', v_row.number,
      'complement', v_row.complement, 'neighborhood', v_row.neighborhood, 'city', v_row.city,
      'state', v_row.state, 'postal_code', v_row.postal_code, 'reference', v_row.reference,
      'is_default', v_row.is_default, 'updated_at', v_row.updated_at
    ));
  end if;

  select not exists (
    select 1 from public.customer_addresses a
    where a.customer_id = p_customer_id and a.is_active = true
  ) into v_default;
  insert into public.customer_addresses (
    customer_id, label, street, number, complement, neighborhood, city, state,
    postal_code, reference, is_default, is_active, last_confirmed_at, created_at, updated_at
  ) values (
    p_customer_id, v_label, v_street, v_number, v_complement, v_neighborhood, v_city, 'MT',
    v_postal_code, v_reference, v_default, true, clock_timestamp(), clock_timestamp(), clock_timestamp()
  ) returning id into v_address_id;

  select * into v_row from public.customer_addresses where id = v_address_id;
  return jsonb_build_object('ok', true, 'created', true, 'address', jsonb_build_object(
    'id', v_row.id, 'label', v_row.label, 'street', v_row.street, 'number', v_row.number,
    'complement', v_row.complement, 'neighborhood', v_row.neighborhood, 'city', v_row.city,
    'state', v_row.state, 'postal_code', v_row.postal_code, 'reference', v_row.reference,
    'is_default', v_row.is_default, 'updated_at', v_row.updated_at
  ));
end;
$function$;

create or replace function public.ops3_storefront_customer_register_v1(
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
  p_source_key text default 'site_checkout',
  p_address_label text default 'Casa'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_phone text := public.canonical_whatsapp_e164_br_v2(p_phone);
  v_document text := regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g');
  v_result jsonb;
  v_address_id uuid;
  v_label text := left(btrim(regexp_replace(coalesce(p_address_label, 'Casa'), '\s+', ' ', 'g')), 60);
begin
  if v_phone is null or not public.ops2_valid_cpf_cnpj_v1(v_document) then
    return jsonb_build_object('ok', false, 'error', case when v_phone is null then 'invalid_phone' else 'invalid_document' end);
  end if;
  if length(v_label) < 1 then v_label := 'Casa'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ops3:registration-phone:' || v_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('ops3:registration-document:' || v_document, 0));

  if exists (
    select 1 from public.customer_ids_by_phone_variants_v1(v_phone) x
  ) then
    return jsonb_build_object('ok', false, 'error', 'existing_customer_requires_verification');
  end if;
  if exists (
    select 1 from public.customers c
    where regexp_replace(coalesce(c.cpf_cnpj, ''), '[^0-9]', '', 'g') = v_document
  ) then
    return jsonb_build_object('ok', false, 'error', 'document_already_in_use');
  end if;

  v_result := public.ops2_upsert_storefront_registration_v1(
    p_phone, p_name, p_document, p_street, p_number, p_neighborhood, p_city,
    p_complement, p_reference, p_postal_code, p_marketing_opt_in, p_source_key
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;
  begin
    v_address_id := nullif(v_result#>>'{address,id}', '')::uuid;
  exception when others then
    v_address_id := null;
  end;
  if v_address_id is not null then
    update public.customer_addresses
       set label = v_label, updated_at = clock_timestamp()
     where id = v_address_id and is_active = true;
    v_result := jsonb_set(v_result, '{address,label}', to_jsonb(v_label), true);
  end if;
  return v_result;
end;
$function$;

revoke all on function public.ops3_site_admin_customer_address_manage_v1(text, uuid, uuid, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.ops3_site_admin_customer_address_manage_v1(text, uuid, uuid, timestamptz, text, jsonb) to service_role;

revoke all on function public.ops3_storefront_customer_document_bind_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ops3_storefront_customer_document_bind_v1(uuid, text, text) to service_role;

revoke all on function public.ops3_storefront_customer_address_add_v1(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ops3_storefront_customer_address_add_v1(uuid, text, text, text, jsonb) to service_role;

revoke all on function public.ops3_storefront_customer_register_v1(text, text, text, text, text, text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.ops3_storefront_customer_register_v1(text, text, text, text, text, text, text, text, text, text, boolean, text, text) to service_role;
