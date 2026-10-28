-- Safe Admin customer editor contract.
-- Phone, CPF/CNPJ, email, identity links and status remain server-owned.
begin;

create or replace function public.ops2_admin_attendance_customer_editor_safe_browser_v1(
  p_conversation_id uuid,
  p_address_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_customer_id uuid;
  v_conversation_phone text;
  v_customer record;
  v_email text;
  v_address_count integer;
  v_default_count integer;
  v_selected_address_id uuid;
  v_address_options jsonb;
begin
  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return v_access;
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_conversation_id');
  end if;

  select c.customer_id, public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)
  into v_customer_id, v_conversation_phone
  from public.conversations c
  where c.id = p_conversation_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'conversation_not_found');
  end if;
  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'customer_not_linked');
  end if;

  select c.id, c.name, c.primary_whatsapp_e164, c.cpf_cnpj, c.is_active, c.updated_at
  into v_customer
  from public.customers c
  where c.id = v_customer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  select ce.email
  into v_email
  from public.customer_emails ce
  where ce.customer_id = v_customer_id
  order by ce.is_primary desc, ce.created_at desc
  limit 1;

  select count(*)::integer, count(*) filter (where ca.is_default)::integer
  into v_address_count, v_default_count
  from public.customer_addresses ca
  where ca.customer_id = v_customer_id and ca.is_active = true;
  if v_address_count > 20 then
    return jsonb_build_object('ok', false, 'error', 'address_list_too_large');
  end if;

  if p_address_id is not null then
    perform 1
    from public.customer_addresses ca
    where ca.id = p_address_id
      and ca.customer_id = v_customer_id
      and ca.is_active = true;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'invalid_address');
    end if;
    v_selected_address_id := p_address_id;
  elsif v_default_count = 1 then
    select ca.id into v_selected_address_id
    from public.customer_addresses ca
    where ca.customer_id = v_customer_id
      and ca.is_active = true
      and ca.is_default = true
    order by ca.updated_at desc, ca.id
    limit 1;
  elsif v_default_count = 0 and v_address_count = 1 then
    select ca.id into v_selected_address_id
    from public.customer_addresses ca
    where ca.customer_id = v_customer_id and ca.is_active = true
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', address_row.id,
        'label', coalesce(nullif(btrim(address_row.label), ''), nullif(btrim(address_row.street), ''), 'Endereço'),
        'street', coalesce(address_row.street, ''),
        'number', coalesce(address_row.number, ''),
        'complement', coalesce(address_row.complement, ''),
        'neighborhood', coalesce(address_row.neighborhood, ''),
        'city', coalesce(address_row.city, ''),
        'state', coalesce(address_row.state, ''),
        'postal_code', coalesce(address_row.postal_code, ''),
        'reference', coalesce(address_row.reference, ''),
        'is_default', address_row.is_default,
        'updated_at', address_row.updated_at
      ) order by address_row.is_default desc, address_row.updated_at desc, address_row.id
    ),
    '[]'::jsonb
  )
  into v_address_options
  from (
    select ca.id, ca.label, ca.street, ca.number, ca.complement,
      ca.neighborhood, ca.city, ca.state, ca.postal_code, ca.reference,
      ca.is_default, ca.updated_at
    from public.customer_addresses ca
    where ca.customer_id = v_customer_id and ca.is_active = true
    order by ca.is_default desc, ca.updated_at desc, ca.id
    limit 20
  ) address_row;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'conversation_phone_e164', v_conversation_phone,
    'selected_address_id', v_selected_address_id,
    'address_requires_choice', v_address_count > 1 and v_selected_address_id is null,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'updated_at', v_customer.updated_at,
      'display_name', coalesce(v_customer.name, ''),
      'phone_e164', v_customer.primary_whatsapp_e164,
      'masked_document', case
        when v_customer.cpf_cnpj is null then null
        when length(regexp_replace(v_customer.cpf_cnpj, '[^0-9]', '', 'g')) = 11
          then '***.***.' || right(regexp_replace(v_customer.cpf_cnpj, '[^0-9]', '', 'g'), 3) || '-**'
        when length(regexp_replace(v_customer.cpf_cnpj, '[^0-9]', '', 'g')) = 14
          then '**.***.***/****-' || right(regexp_replace(v_customer.cpf_cnpj, '[^0-9]', '', 'g'), 2)
        else 'Documento salvo'
      end,
      'email', v_email,
      'status', case when v_customer.is_active = false then 'inactive' else 'active' end
    ),
    'addresses', v_address_options
  );
end;
$function$;

revoke all on function public.ops2_admin_attendance_customer_editor_safe_browser_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_customer_editor_safe_browser_v1(uuid, uuid)
  to authenticated;
comment on function public.ops2_admin_attendance_customer_editor_safe_browser_v1(uuid, uuid)
  is 'Bounded customer editor projection; masks CPF/CNPJ in SQL and exposes only active address choices with revision timestamps.';

create or replace function public.ops2_admin_attendance_customer_update_browser_v1(
  p_conversation_id uuid,
  p_expected_customer_updated_at timestamptz,
  p_customer_name text,
  p_address_id uuid default null,
  p_expected_address_updated_at timestamptz default null,
  p_address jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_admin_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_customer_updated_at timestamptz;
  v_name text := nullif(left(btrim(regexp_replace(coalesce(p_customer_name, ''), '[[:space:]]+', ' ', 'g')), 180), '');
  v_address_updated_at timestamptz;
  v_street text;
  v_number text;
  v_complement text;
  v_neighborhood text;
  v_city text;
  v_state_raw text;
  v_state text;
  v_postal_code text;
  v_reference text;
  v_changed_fields text[] := array[]::text[];
  v_audit_id uuid;
begin
  if v_admin_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  v_access := public.ops2_admin_attendance_customer_access_v1(true);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return v_access;
  end if;
  if p_conversation_id is null or p_expected_customer_updated_at is null or v_name is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_customer');
  end if;
  if (p_address_id is null) <> (p_expected_address_updated_at is null)
    or (p_address_id is null and p_address is not null)
    or (p_address_id is not null and coalesce(jsonb_typeof(p_address), '') <> 'object') then
    return jsonb_build_object('ok', false, 'error', 'invalid_address');
  end if;

  select c.customer_id into v_customer_id
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'conversation_not_found');
  end if;
  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'customer_not_linked');
  end if;

  select c.updated_at into v_customer_updated_at
  from public.customers c
  where c.id = v_customer_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;
  if v_customer_updated_at is distinct from p_expected_customer_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_customer');
  end if;

  if p_address_id is not null then
    select ca.updated_at into v_address_updated_at
    from public.customer_addresses ca
    where ca.id = p_address_id
      and ca.customer_id = v_customer_id
      and ca.is_active = true
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'invalid_address');
    end if;
    if v_address_updated_at is distinct from p_expected_address_updated_at then
      return jsonb_build_object('ok', false, 'error', 'stale_address');
    end if;

    v_street := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'street', ''), '[[:cntrl:]]+', ' ', 'g')), 180), '');
    v_number := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'number', ''), '[[:cntrl:]]+', ' ', 'g')), 40), '');
    v_complement := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'complement', ''), '[[:cntrl:]]+', ' ', 'g')), 140), '');
    v_neighborhood := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'neighborhood', ''), '[[:cntrl:]]+', ' ', 'g')), 140), '');
    v_city := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'city', ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
    v_state_raw := nullif(btrim(coalesce(p_address ->> 'state', '')), '');
    v_state := upper(v_state_raw);
    v_postal_code := nullif(left(regexp_replace(coalesce(p_address ->> 'postal_code', ''), '[^0-9]', '', 'g'), 8), '');
    v_reference := nullif(left(btrim(regexp_replace(coalesce(p_address ->> 'reference', ''), '[[:cntrl:]]+', ' ', 'g')), 400), '');

    if v_street is null or v_city is null
      or (v_state is not null and v_state !~ '^[A-Z]{2}$')
      or length(regexp_replace(coalesce(p_address ->> 'postal_code', ''), '[^0-9]', '', 'g')) > 8 then
      return jsonb_build_object('ok', false, 'error', 'invalid_address_fields');
    end if;
  end if;

  update public.customers c
  set name = v_name
  where c.id = v_customer_id
    and c.name is distinct from v_name;
  if found then
    v_changed_fields := array_append(v_changed_fields, 'name');
  end if;

  if p_address_id is not null then
    update public.customer_addresses ca
    set street = v_street,
      number = v_number,
      complement = v_complement,
      neighborhood = v_neighborhood,
      city = v_city,
      state = v_state,
      postal_code = v_postal_code,
      reference = v_reference
    where ca.id = p_address_id
      and ca.customer_id = v_customer_id
      and ca.is_active = true
      and (ca.street, ca.number, ca.complement, ca.neighborhood, ca.city, ca.state, ca.postal_code, ca.reference)
        is distinct from (v_street, v_number, v_complement, v_neighborhood, v_city, v_state, v_postal_code, v_reference);
    if found then
      v_changed_fields := array_append(v_changed_fields, 'delivery_address');
    end if;
  end if;

  if cardinality(v_changed_fields) = 0 then
    return jsonb_build_object('ok', true, 'saved', false, 'customer_id', v_customer_id);
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (
    v_admin_user_id,
    'customer_profile_or_address_updated',
    'customer',
    v_customer_id::text,
    jsonb_build_object(
      'conversation_id', p_conversation_id,
      'address_id', p_address_id,
      'changed_fields', to_jsonb(v_changed_fields)
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'saved', true,
    'customer_id', v_customer_id,
    'audit_id', v_audit_id
  );
end;
$function$;

revoke all on function public.ops2_admin_attendance_customer_update_browser_v1(uuid, timestamptz, text, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_customer_update_browser_v1(uuid, timestamptz, text, uuid, timestamptz, jsonb)
  to authenticated;
comment on function public.ops2_admin_attendance_customer_update_browser_v1(uuid, timestamptz, text, uuid, timestamptz, jsonb)
  is 'Conversation-scoped optimistic customer editor. Preserves phone, CPF/CNPJ, email and address flags; audits changed columns without storing PII values.';

commit;
