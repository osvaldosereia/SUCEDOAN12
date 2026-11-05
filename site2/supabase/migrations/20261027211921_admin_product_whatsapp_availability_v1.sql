create or replace function public.admin_product_whatsapp_availability_v1(
  p_actor_id uuid,
  p_product_id uuid,
  p_expected_whatsapp_active boolean,
  p_whatsapp_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_product record;
  v_name text;
  v_name_units integer;
  v_image_url_units integer;
  v_image_match text[];
  v_image_authority text;
  v_image_host text;
  v_image_port_text text;
  v_image_port integer;
  v_image_ip pg_catalog.inet;
  v_close_bracket integer;
  v_effective_price numeric;
  v_updated_at timestamptz;
  v_now timestamptz := pg_catalog.now();
begin
  if p_actor_id is null
    or p_product_id is null
    or p_expected_whatsapp_active is null
    or p_whatsapp_active is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform 1
  from public.admin_users as u
  where u.user_id = p_actor_id
    and u.is_active is true
    and u.role = any (array['owner', 'admin', 'catalog_manager']::text[])
  for share;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  select
      p.id,
      p.name,
      p.is_active,
      p.is_whatsapp_active,
      p.image_url,
      p.price,
      p.is_offer,
      p.offer_price,
      p.updated_at
    into v_product
  from public.products as p
  where p.id = p_product_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_product.is_whatsapp_active is not distinct from p_whatsapp_active then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'whatsapp_active', v_product.is_whatsapp_active,
      'updated_at', v_product.updated_at
    );
  end if;

  if v_product.is_whatsapp_active is distinct from p_expected_whatsapp_active then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'conflict');
  end if;

  if p_whatsapp_active then
    if v_product.is_active is not true then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'product_inactive');
    end if;

    v_name := pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.translate(
          v_product.name,
          pg_catalog.chr(1) || pg_catalog.chr(2) || pg_catalog.chr(3) || pg_catalog.chr(4) ||
            pg_catalog.chr(5) || pg_catalog.chr(6) || pg_catalog.chr(7) || pg_catalog.chr(8) ||
            pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(11) || pg_catalog.chr(12) ||
            pg_catalog.chr(13) || pg_catalog.chr(14) || pg_catalog.chr(15) || pg_catalog.chr(16) ||
            pg_catalog.chr(17) || pg_catalog.chr(18) || pg_catalog.chr(19) || pg_catalog.chr(20) ||
            pg_catalog.chr(21) || pg_catalog.chr(22) || pg_catalog.chr(23) || pg_catalog.chr(24) ||
            pg_catalog.chr(25) || pg_catalog.chr(26) || pg_catalog.chr(27) || pg_catalog.chr(28) ||
            pg_catalog.chr(29) || pg_catalog.chr(30) || pg_catalog.chr(31) || pg_catalog.chr(127),
          pg_catalog.repeat(' ', 32)
        ),
        U&'[ \00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
        ' ',
        'g'
      )
    );

    select coalesce(
      pg_catalog.sum(
        case
          when pg_catalog.ascii(pg_catalog.substr(v_name, characters.char_index, 1)) > 65535 then 2
          else 1
        end
      ),
      0
    )::integer
      into v_name_units
    from pg_catalog.generate_series(1, pg_catalog.char_length(v_name)) as characters(char_index);

    if v_name is null or v_name = '' or v_name_units > 180 then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_name_invalid');
    end if;

    if v_product.image_url is null then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
    end if;

    select coalesce(
      pg_catalog.sum(
        case
          when pg_catalog.ascii(pg_catalog.substr(v_product.image_url, characters.char_index, 1)) > 65535 then 2
          else 1
        end
      ),
      0
    )::integer
      into v_image_url_units
    from pg_catalog.generate_series(1, pg_catalog.char_length(v_product.image_url)) as characters(char_index);

    if v_image_url_units > 2048 or v_product.image_url ~ '[[:space:]]' then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
    end if;

    v_image_match := pg_catalog.regexp_match(v_product.image_url, '^https://([^/?#]+)', 'i');
    if v_image_match is null then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
    end if;

    v_image_authority := v_image_match[1];
    v_image_port_text := null;
    if v_image_authority ~ '@' then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
    end if;

    if pg_catalog.left(v_image_authority, 1) = '[' then
      v_close_bracket := pg_catalog.strpos(v_image_authority, ']');
      if v_close_bracket < 3 then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
      end if;
      v_image_host := pg_catalog.substr(v_image_authority, 2, v_close_bracket - 2);
      v_image_port_text := pg_catalog.substr(v_image_authority, v_close_bracket + 1);
      if v_image_port_text = '' then
        v_image_port_text := null;
      else
        if v_image_port_text !~ '^:[0-9]{1,5}$' then
          return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
        end if;
        v_image_port_text := pg_catalog.substr(v_image_port_text, 2);
      end if;

      begin
        v_image_ip := v_image_host::pg_catalog.inet;
      exception when invalid_text_representation then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
      end;
      if pg_catalog.family(v_image_ip) <> 6 or pg_catalog.masklen(v_image_ip) <> 128 then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
      end if;
    else
      if v_image_authority ~ ':' then
        if v_image_authority !~ '^[^:]+:[0-9]{1,5}$' then
          return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
        end if;
        v_image_host := pg_catalog.split_part(v_image_authority, ':', 1);
        v_image_port_text := pg_catalog.split_part(v_image_authority, ':', 2);
      else
        v_image_host := v_image_authority;
      end if;

      if v_image_host ~ '^[0-9]+(\.[0-9]+)*$' then
        begin
          v_image_ip := v_image_host::pg_catalog.inet;
        exception when invalid_text_representation then
          return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
        end;
        if pg_catalog.family(v_image_ip) <> 4 or pg_catalog.masklen(v_image_ip) <> 32 then
          return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
        end if;
      elsif pg_catalog.char_length(v_image_host) > 253
        or v_image_host !~* '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
      end if;
    end if;

    if v_image_port_text is not null then
      v_image_port := v_image_port_text::integer;
      if v_image_port > 65535 then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_image_invalid');
      end if;
    end if;

    v_effective_price := v_product.price;
    if v_product.is_offer is true
      and v_product.offer_price is not null
      and v_product.offer_price >= 0
      and v_product.offer_price <= 9999999.99
      and v_product.offer_price = pg_catalog.trunc(v_product.offer_price, 2) then
      v_effective_price := v_product.offer_price;
    end if;

    if v_effective_price is null
      or v_effective_price < 0
      or v_effective_price > 9999999.99
      or v_effective_price <> pg_catalog.trunc(v_effective_price, 2) then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'flow_price_invalid');
    end if;
  end if;

  update public.products as p
  set is_whatsapp_active = p_whatsapp_active,
      updated_at = v_now
  where p.id = p_product_id
  returning p.updated_at into v_updated_at;

  insert into public.admin_audit_logs (
    id,
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) values (
    pg_catalog.gen_random_uuid(),
    p_actor_id,
    'product.whatsapp_availability.updated',
    'product',
    p_product_id::text,
    pg_catalog.jsonb_build_object(
      'previous_is_whatsapp_active', v_product.is_whatsapp_active,
      'is_whatsapp_active', p_whatsapp_active
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'whatsapp_active', p_whatsapp_active,
    'updated_at', v_updated_at
  );
end;
$function$;

revoke all on function public.admin_product_whatsapp_availability_v1(uuid, uuid, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_product_whatsapp_availability_v1(uuid, uuid, boolean, boolean)
  to service_role;
