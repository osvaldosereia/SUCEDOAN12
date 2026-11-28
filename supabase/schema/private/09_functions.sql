-- function: bling_hub_valid_gtin_from_sku_v1(p_value text)
CREATE OR REPLACE FUNCTION private.bling_hub_valid_gtin_from_sku_v1(p_value text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_code text := btrim(coalesce(p_value, ''));
  v_length integer;
  v_sum integer := 0;
  v_position integer;
begin
  if v_code !~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' then
    return false;
  end if;

  v_length := length(v_code);
  for v_position in 1..(v_length - 1) loop
    v_sum := v_sum + substring(v_code from v_position for 1)::integer
      * case when mod(v_length - 1 - v_position, 2) = 0 then 3 else 1 end;
  end loop;

  return (10 - mod(v_sum, 10)) % 10 = right(v_code, 1)::integer;
end
$function$
;

-- function: da_instagram_automation_cron_tick_v1()
CREATE OR REPLACE FUNCTION private.da_instagram_automation_cron_tick_v1()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'vault', 'net', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name='dona_antonia_instagram_automation_cron_v1'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL OR length(v_token)<32 THEN
    RAISE EXCEPTION 'Instagram automation cron token is missing';
  END IF;

  SELECT net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/instagram-automation-manager-v1',
    body := '{"action":"run_scheduled"}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
      'x-da-instagram-cron-key',v_token
    ),
    timeout_milliseconds := 240000
  ) INTO v_request_id;

  RETURN v_request_id;
END
$function$
;

-- function: da_offer_cycle_v1()
CREATE OR REPLACE FUNCTION private.da_offer_cycle_v1()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  SELECT private.da_offer_rotation_run_v1(false);
$function$
;

-- function: da_offer_cycle_with_status_images_v1()
CREATE OR REPLACE FUNCTION private.da_offer_cycle_with_status_images_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'vault', 'net', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_rotation jsonb;
  v_token text;
  v_request_id bigint;
BEGIN
  v_rotation := private.da_offer_rotation_run_v1(false);

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name='da_offer_status_images_cron_token_v1'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    SELECT net.http_post(
      url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/daily-offer-status-images-v1',
      body := '{"action":"generate"}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
        'x-da-offer-cron-key',v_token
      ),
      timeout_milliseconds := 10000
    ) INTO v_request_id;
  END IF;

  RETURN coalesce(v_rotation,'{}'::jsonb) || jsonb_build_object(
    'images_requested',v_request_id IS NOT NULL,
    'image_request_id',v_request_id
  );
END
$function$
;

-- function: da_offer_rotation_run_v1(p_force boolean)
CREATE OR REPLACE FUNCTION private.da_offer_rotation_run_v1(p_force boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_state private.da_offer_rotation_state_v1%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(6121013);
  SELECT * INTO v_state FROM private.da_offer_rotation_state_v1 WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily offer rotation state missing';
  END IF;

  v_starts_at := v_today::timestamp AT TIME ZONE 'America/Cuiaba';
  v_ends_at := (v_today + 1)::timestamp AT TIME ZONE 'America/Cuiaba';

  IF v_state.enabled IS DISTINCT FROM true THEN
    UPDATE public.products
    SET is_offer=false,
        offer_price=NULL,
        metadata=coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date'
    WHERE metadata->>'offer_source'='auto_rotation';
    UPDATE private.da_offer_rotation_state_v1
    SET last_run_at=now(),last_rotation_date=v_today,last_rotation_count=0
    WHERE id=1;
    RETURN jsonb_build_object('rotated',false,'enabled',false,'date',v_today::text,'offer_count',0);
  END IF;

  IF coalesce(p_force,false)=false AND v_state.last_rotation_date=v_today THEN
    RETURN jsonb_build_object(
      'rotated',false,
      'already_rotated',true,
      'enabled',true,
      'date',v_today::text,
      'offer_count',v_state.last_rotation_count
    );
  END IF;

  UPDATE public.products
  SET is_offer=false,
      offer_price=NULL,
      metadata=coalesce(metadata,'{}'::jsonb)-'offer_source'-'offer_discount_percent'-'offer_starts_at'-'offer_ends_at'-'offer_rotation_date'
  WHERE metadata->>'offer_source'='auto_rotation';

  WITH settings AS (
    SELECT daily_product_count,min_discount_percent,max_discount_percent,min_gross_margin_percent
    FROM private.da_offer_rotation_state_v1
    WHERE id=1
  ),
  candidates AS (
    SELECT p.id,p.price,p.cost,
      (s.min_discount_percent+floor(random()*(s.max_discount_percent-s.min_discount_percent+1)))::integer AS discount_percent,
      s.min_gross_margin_percent
    FROM public.products p
    JOIN public.storefront_product_sellable_stock_v1 stock ON stock.product_id=p.id
    CROSS JOIN settings s
    WHERE p.is_active=true
      AND stock.is_active=true
      AND coalesce(stock.sellable_stock,0)>0
      AND p.price>0
      AND p.cost>0
      AND NULLIF(BTRIM(p.image_url),'') IS NOT NULL
      AND (p.validity_date IS NULL OR p.validity_date>=v_today)
      AND p.is_offer IS DISTINCT FROM true
      AND p.metadata->>'daily_offer_excluded_date' IS DISTINCT FROM v_today::text
      AND (
        nullif(p.metadata->>'daily_offer_last_selected_date','') IS NULL
        OR p.metadata->>'daily_offer_last_selected_date' <= (v_today-7)::text
      )
  ),
  priced AS (
    SELECT id,price,cost,discount_percent,min_gross_margin_percent,
      round(price*(100-discount_percent)::numeric/100,2) AS final_price
    FROM candidates
  ),
  chosen AS (
    SELECT id,discount_percent,final_price
    FROM priced
    WHERE final_price>0
      AND final_price<price
      AND final_price>=cost/(1-min_gross_margin_percent/100)
    ORDER BY random()
    LIMIT (SELECT daily_product_count FROM settings)
  )
  UPDATE public.products p
  SET is_offer=true,
      offer_price=chosen.final_price,
      metadata=(coalesce(p.metadata,'{}'::jsonb)-'daily_offer_excluded_date')
        || jsonb_build_object(
          'offer_source','auto_rotation',
          'offer_discount_percent',chosen.discount_percent,
          'offer_starts_at',v_starts_at,
          'offer_ends_at',v_ends_at,
          'offer_rotation_date',v_today::text,
          'daily_offer_last_selected_date',v_today::text
        )
  FROM chosen
  WHERE p.id=chosen.id;

  GET DIAGNOSTICS v_count=ROW_COUNT;

  UPDATE private.da_offer_rotation_state_v1
  SET cycle_started_at=now(),
      last_run_at=now(),
      last_rotation_date=v_today,
      last_rotation_count=v_count
  WHERE id=1;

  RETURN jsonb_build_object(
    'rotated',true,
    'enabled',true,
    'date',v_today::text,
    'offer_count',v_count,
    'target_count',v_state.daily_product_count
  );
END
$function$
;

-- function: da_offer_rotation_snapshot_v1()
CREATE OR REPLACE FUNCTION private.da_offer_rotation_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_state private.da_offer_rotation_state_v1%ROWTYPE;
  v_offers jsonb;
  v_today date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  SELECT * INTO v_state FROM private.da_offer_rotation_state_v1 WHERE id=1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('config',jsonb_build_object('enabled',false),'offers','[]'::jsonb);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'name',p.name,
        'image_url',p.image_url,
        'price',p.price,
        'offer_price',p.offer_price,
        'discount_percent',coalesce(nullif(p.metadata->>'offer_discount_percent','')::integer,0),
        'sellable_stock',coalesce(s.sellable_stock,0)
      ) ORDER BY p.name
    ),
    '[]'::jsonb
  )
  INTO v_offers
  FROM public.products p
  LEFT JOIN public.storefront_product_sellable_stock_v1 s ON s.product_id=p.id
  WHERE p.is_active=true
    AND p.is_offer=true
    AND p.metadata->>'offer_source'='auto_rotation'
    AND p.metadata->>'offer_rotation_date'=v_today::text;

  RETURN jsonb_build_object(
    'config',jsonb_build_object(
      'enabled',v_state.enabled,
      'daily_product_count',v_state.daily_product_count,
      'min_discount_percent',v_state.min_discount_percent,
      'max_discount_percent',v_state.max_discount_percent,
      'min_gross_margin_percent',v_state.min_gross_margin_percent,
      'last_rotation_date',v_state.last_rotation_date,
      'last_rotation_count',v_state.last_rotation_count,
      'today',v_today::text,
      'last_rotation_at',v_state.last_run_at
    ),
    'offers',v_offers
  );
END
$function$
;

-- function: import_bling_customers_v1(p_rows jsonb, p_import_tag text)
CREATE OR REPLACE FUNCTION private.import_bling_customers_v1(p_rows jsonb, p_import_tag text DEFAULT 'bling_csv'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_customer uuid;
  v_doc text;
  v_cell text;
  v_fone text;
  v_owner uuid;
  v_inserted integer:=0;
  v_matched integer:=0;
  v_phones integer:=0;
  v_phone_conflicts integer:=0;
  v_emails integer:=0;
  v_addresses integer:=0;
  v_total integer:=0;
begin
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'rows_array_required'; end if;
  if jsonb_array_length(p_rows)>500 then raise exception 'batch_too_large'; end if;

  for r in select * from jsonb_to_recordset(p_rows) as x(
    bling_contact_id bigint,name text,cpf_cnpj text,cell_e164 text,fone_e164 text,email text,
    street text,number text,complement text,neighborhood text,city text,state text,postal_code text
  ) loop
    v_total:=v_total+1;
    if r.bling_contact_id is null or r.bling_contact_id<=0 then continue; end if;
    v_customer:=null; v_owner:=null;
    v_doc:=nullif(regexp_replace(coalesce(r.cpf_cnpj,''),'[^0-9]','','g'),'');
    if v_doc is not null and length(v_doc) not in (11,14) then v_doc:=null; end if;
    v_cell:=nullif(btrim(coalesce(r.cell_e164,'')),'');
    v_fone:=nullif(btrim(coalesce(r.fone_e164,'')),'');

    if v_cell is not null and (select count(*) from jsonb_array_elements(p_rows) e where public.normalize_phone_digits(e->>'cell_e164')=public.normalize_phone_digits(v_cell) or public.normalize_phone_digits(e->>'fone_e164')=public.normalize_phone_digits(v_cell))>1 then v_cell:=null; v_phone_conflicts:=v_phone_conflicts+1; end if;
    if v_fone is not null and (select count(*) from jsonb_array_elements(p_rows) e where public.normalize_phone_digits(e->>'cell_e164')=public.normalize_phone_digits(v_fone) or public.normalize_phone_digits(e->>'fone_e164')=public.normalize_phone_digits(v_fone))>1 then v_fone:=null; v_phone_conflicts:=v_phone_conflicts+1; end if;

    select c.id into v_customer from public.customers c where c.bling_contact_id=r.bling_contact_id limit 1;
    if v_customer is null and v_doc is not null then select c.id into v_customer from public.customers c where regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_doc limit 1; end if;
    if v_customer is null and v_cell is not null then
      select cp.customer_id into v_customer from public.customer_phones cp where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_cell) limit 1;
      if v_customer is null then select c.id into v_customer from public.customers c where public.normalize_phone_digits(c.primary_whatsapp_e164)=public.normalize_phone_digits(v_cell) limit 1; end if;
    end if;

    if v_customer is null then
      insert into public.customers(bling_contact_id,name,cpf_cnpj,primary_whatsapp_e164,is_active,last_bling_sync_at,marketing_opt_in)
      values(r.bling_contact_id,nullif(btrim(r.name),''),case when v_doc is not null then r.cpf_cnpj else null end,v_cell,true,now(),false)
      returning id into v_customer; v_inserted:=v_inserted+1;
    else
      v_matched:=v_matched+1;
      update public.customers c set
        bling_contact_id=case when c.bling_contact_id is null or c.bling_contact_id=r.bling_contact_id then r.bling_contact_id else c.bling_contact_id end,
        name=case when c.name is null or length(btrim(c.name))<2 then coalesce(nullif(btrim(r.name),''),c.name) else c.name end,
        cpf_cnpj=case when c.cpf_cnpj is null and v_doc is not null and not exists(select 1 from public.customers d where d.id<>c.id and regexp_replace(coalesce(d.cpf_cnpj,''),'[^0-9]','','g')=v_doc) then r.cpf_cnpj else c.cpf_cnpj end,
        primary_whatsapp_e164=case when c.primary_whatsapp_e164 is null and v_cell is not null and not exists(select 1 from public.customers p where p.id<>c.id and public.normalize_phone_digits(p.primary_whatsapp_e164)=public.normalize_phone_digits(v_cell)) then v_cell else c.primary_whatsapp_e164 end,
        last_bling_sync_at=now(),is_active=true where c.id=v_customer;
    end if;

    if v_cell is not null then
      select cp.customer_id into v_owner from public.customer_phones cp where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_cell) limit 1;
      if v_owner is null then insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at) values(v_customer,v_cell,'bling',true,null) on conflict(phone_e164) do nothing; if found then v_phones:=v_phones+1; end if;
      elsif v_owner=v_customer then update public.customer_phones set is_primary=true where customer_id=v_customer and public.normalize_phone_digits(phone_e164)=public.normalize_phone_digits(v_cell);
      else v_phone_conflicts:=v_phone_conflicts+1; end if;
    end if;

    if v_fone is not null and (v_cell is null or public.normalize_phone_digits(v_fone)<>public.normalize_phone_digits(v_cell)) then
      v_owner:=null; select cp.customer_id into v_owner from public.customer_phones cp where public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_fone) limit 1;
      if v_owner is null then insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at) values(v_customer,v_fone,'bling',false,null) on conflict(phone_e164) do nothing; if found then v_phones:=v_phones+1; end if;
      elsif v_owner<>v_customer then v_phone_conflicts:=v_phone_conflicts+1; end if;
    end if;

    if nullif(btrim(coalesce(r.email,'')),'') is not null and position('@' in btrim(r.email))>1 and not exists(select 1 from public.customer_emails e where e.customer_id=v_customer and e.email_normalized=lower(btrim(r.email))) then
      insert into public.customer_emails(customer_id,email,verification_status,is_primary,source,evidence) values(v_customer,btrim(r.email),'observed',false,'bling',jsonb_build_object('import_tag',p_import_tag,'bling_contact_id',r.bling_contact_id)); v_emails:=v_emails+1;
    end if;

    if coalesce(nullif(btrim(coalesce(r.street,'')),''),nullif(btrim(coalesce(r.number,'')),''),nullif(btrim(coalesce(r.complement,'')),''),nullif(btrim(coalesce(r.neighborhood,'')),''),nullif(btrim(coalesce(r.city,'')),''),nullif(btrim(coalesce(r.state,'')),''),nullif(btrim(coalesce(r.postal_code,'')),'') ) is not null and not exists(select 1 from public.customer_addresses a where a.customer_id=v_customer and a.bling_address_ref=('contact:'||r.bling_contact_id::text||':main')) then
      insert into public.customer_addresses(customer_id,bling_address_ref,label,street,number,complement,neighborhood,city,state,postal_code,is_default,is_active)
      values(v_customer,'contact:'||r.bling_contact_id::text||':main','Bling',nullif(btrim(r.street),''),nullif(btrim(r.number),''),nullif(btrim(r.complement),''),nullif(btrim(r.neighborhood),''),nullif(btrim(r.city),''),nullif(btrim(r.state),''),nullif(btrim(r.postal_code),''),true,true); v_addresses:=v_addresses+1;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'rows',v_total,'inserted',v_inserted,'matched_existing',v_matched,'phones_inserted',v_phones,'phone_conflicts',v_phone_conflicts,'emails_inserted',v_emails,'addresses_inserted',v_addresses,'import_tag',p_import_tag);
end;
$function$
;

-- function: li_bridge_dispatch(p_action text, p_args jsonb)
CREATE OR REPLACE FUNCTION private.li_bridge_dispatch(p_action text, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(job_id uuid, request_id bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_proof text;
  v_job uuid;
  v_request bigint;
begin
  if p_action not in ('status','products','categories') then
    raise exception 'unsupported_action' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_args,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_args' using errcode='22023';
  end if;
  v_proof := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.li_bridge_probe_jobs (proof_hash, action, args)
  values (encode(extensions.digest(v_proof,'sha256'),'hex'), p_action, p_args)
  returning id into v_job;
  v_request := net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/loja-integrada-probe-v1',
    body := jsonb_build_object('id', v_job::text, 'proof', v_proof),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  return query select v_job, v_request;
end;
$function$
;

-- function: order_addon_close_sessions_for_order_v1(p_order_id uuid, p_reason text)
CREATE OR REPLACE FUNCTION private.order_addon_close_sessions_for_order_v1(p_order_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update private.order_addon_sessions_v1
  set status='closed',closed_at=coalesce(closed_at,now()),
      close_reason=coalesce(close_reason,left(coalesce(p_reason,'order_closed'),80)),updated_at=now()
  where order_id=p_order_id and status='open';
$function$
;

-- function: order_addon_orders_close_trigger_v1()
CREATE OR REPLACE FUNCTION private.order_addon_orders_close_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status is distinct from old.status
     or new.confirmed_at is distinct from old.confirmed_at
     or new.bling_order_id is distinct from old.bling_order_id
     or new.bling_synced_at is distinct from old.bling_synced_at
     or new.sync_status is distinct from old.sync_status then
    if coalesce(new.status,'')<>'storefront_received'
       or new.confirmed_at is not null
       or new.bling_order_id is not null
       or new.bling_synced_at is not null
       or coalesce(new.sync_status,'local')<>'local' then
      perform private.order_addon_close_sessions_for_order_v1(new.id,'order_advanced');
    end if;
  end if;
  return new;
end;
$function$
;

-- function: order_addon_separation_close_trigger_v1()
CREATE OR REPLACE FUNCTION private.order_addon_separation_close_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.order_addon_close_sessions_for_order_v1(new.order_id,'separation_started');
  return new;
end;
$function$
;

-- function: set_updated_at()
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- function: whatsapp_ana_admin_immutable_v1()
CREATE OR REPLACE FUNCTION private.whatsapp_ana_admin_immutable_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'ana_admin_record_immutable';
END;
$function$
;
