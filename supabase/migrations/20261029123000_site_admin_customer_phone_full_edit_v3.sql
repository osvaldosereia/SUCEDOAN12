CREATE OR REPLACE FUNCTION public.ops2_site_admin_customer_update_v3(p_customer_id uuid, p_expected_customer_updated_at timestamp with time zone, p_name text, p_address_id uuid, p_expected_address_updated_at timestamp with time zone, p_address jsonb, p_document text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_customer_updated_at timestamptz;
  v_address_updated_at timestamptz;
  v_address_id uuid := p_address_id;
  v_now timestamptz := clock_timestamp();
  v_name text := btrim(coalesce(p_name, ''));
  v_street text := btrim(coalesce(p_address->>'street', ''));
  v_number text := btrim(coalesce(p_address->>'number', ''));
  v_complement text := nullif(btrim(coalesce(p_address->>'complement', '')), '');
  v_neighborhood text := btrim(coalesce(p_address->>'neighborhood', ''));
  v_city text := btrim(coalesce(p_address->>'city', ''));
  v_state text := upper(btrim(coalesce(p_address->>'state', '')));
  v_postal_code text := nullif(btrim(coalesce(p_address->>'postal_code', '')), '');
  v_reference text := nullif(btrim(coalesce(p_address->>'reference', '')), '');
  v_has_address boolean;
  v_document text := regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g');
  v_previous_document text;
  v_previous_phone text;
  v_phone text := btrim(coalesce(p_phone, ''));
  v_phone_row_id uuid;
begin
  if p_customer_id is null or p_expected_customer_updated_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_snapshot');
  end if;
  if v_phone !~ '^\+55[1-9][0-9]{9,10}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if length(v_name) < 2 or length(v_name) > 180 then
    return jsonb_build_object('ok', false, 'error', 'customer_name_required');
  end if;

  v_has_address := concat_ws('', v_street, v_number, v_complement, v_neighborhood, v_city, v_state, v_postal_code, v_reference) <> '';
  if v_has_address and (
    v_street = '' or v_number = '' or v_neighborhood = '' or v_city = '' or length(v_state) <> 2
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer_address');
  end if;
  if p_address_id is not null and (not v_has_address or p_expected_address_updated_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_address_snapshot');
  end if;

  select c.updated_at, c.cpf_cnpj, c.primary_whatsapp_e164
    into v_customer_updated_at, v_previous_document, v_previous_phone
  from public.customers as c
  where c.id = p_customer_id and c.is_active = true
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;
  if v_customer_updated_at is distinct from p_expected_customer_updated_at then
    return jsonb_build_object('ok', false, 'error', 'customer_changed');
  end if;

  if v_document <> '' and not public.ops2_valid_cpf_cnpj_v1(v_document)
    and v_document is distinct from regexp_replace(coalesce(v_previous_document, ''), '[^0-9]', '', 'g') then
    return jsonb_build_object('ok', false, 'error', 'invalid_document');
  end if;
  if v_document <> '' and exists (
    select 1 from public.customers c
    where c.id <> p_customer_id
      and regexp_replace(coalesce(c.cpf_cnpj,''), '[^0-9]', '', 'g') = v_document
  ) then
    return jsonb_build_object('ok', false, 'error', 'document_already_in_use');
  end if;

  if v_phone <> coalesce(v_previous_phone,'') and (
    exists(select 1 from public.customers c where c.id <> p_customer_id and c.primary_whatsapp_e164 = v_phone)
    or exists(select 1 from public.customer_phones cp where cp.customer_id <> p_customer_id
      and public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone))
  ) then
    return jsonb_build_object('ok', false, 'error', 'phone_already_in_use');
  end if;

  if p_address_id is not null then
    select a.updated_at
      into v_address_updated_at
    from public.customer_addresses as a
    where a.id = p_address_id and a.customer_id = p_customer_id and a.is_active = true
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'customer_address_not_found');
    end if;
    if v_address_updated_at is distinct from p_expected_address_updated_at then
      return jsonb_build_object('ok', false, 'error', 'customer_changed');
    end if;
  end if;

  update public.customers
  set name = v_name, cpf_cnpj = nullif(v_document,''), primary_whatsapp_e164 = v_phone, updated_at = v_now
  where id = p_customer_id
  returning updated_at into v_customer_updated_at;

  if v_phone is distinct from v_previous_phone then
    select cp.id into v_phone_row_id from public.customer_phones cp
      where cp.customer_id = p_customer_id and cp.phone_e164 = v_phone limit 1;
    if v_phone_row_id is null then
      select cp.id into v_phone_row_id from public.customer_phones cp
        where cp.customer_id = p_customer_id and cp.phone_e164 = v_previous_phone limit 1;
      if v_phone_row_id is not null then
        update public.customer_phones set phone_e164=v_phone where id=v_phone_row_id;
      else
        insert into public.customer_phones(customer_id,phone_e164,source,is_primary)
          values(p_customer_id,v_phone,'site_admin_code',true);
      end if;
    end if;
    update public.customer_phones set is_primary=(phone_e164=v_phone)
      where customer_id=p_customer_id and is_primary is distinct from (phone_e164=v_phone);
  end if;

  if p_address_id is not null then
    update public.customer_addresses
    set street = v_street,
        number = v_number,
        complement = v_complement,
        neighborhood = v_neighborhood,
        city = v_city,
        state = v_state,
        postal_code = v_postal_code,
        reference = v_reference,
        updated_at = v_now
    where id = p_address_id and customer_id = p_customer_id
    returning id, updated_at into v_address_id, v_address_updated_at;
  elsif v_has_address then
    insert into public.customer_addresses (
      customer_id, street, number, complement, neighborhood, city, state,
      postal_code, reference, is_default, is_active, updated_at
    )
    values (
      p_customer_id, v_street, v_number, v_complement, v_neighborhood, v_city, v_state,
      v_postal_code, v_reference, false, true, v_now
    )
    returning id, updated_at into v_address_id, v_address_updated_at;
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  )
  values (
    null,
    'customer_update_admin_code',
    'customer',
    p_customer_id::text,
    jsonb_build_object(
      'source', 'site_admin_code',
      'fields', case when v_address_id is null then jsonb_build_array('name')
                     else jsonb_build_array('name', 'address') end
      || case when nullif(regexp_replace(coalesce(v_previous_document,''), '[^0-9]', '', 'g'),'') is distinct from nullif(v_document,'')
            then jsonb_build_array('cpf_cnpj') else '[]'::jsonb end
      || case when v_phone is distinct from v_previous_phone then jsonb_build_array('primary_whatsapp_e164') else '[]'::jsonb end,
      'address_id', v_address_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'customer_updated_at', v_customer_updated_at,
    'address_id', v_address_id,
    'address_updated_at', v_address_updated_at
  );
end;
$function$;
revoke all on function public.ops2_site_admin_customer_update_v3(uuid,timestamptz,text,uuid,timestamptz,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ops2_site_admin_customer_update_v3(uuid,timestamptz,text,uuid,timestamptz,jsonb,text,text) to service_role;
