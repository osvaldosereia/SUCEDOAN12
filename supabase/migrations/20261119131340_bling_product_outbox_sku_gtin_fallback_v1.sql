create or replace function private.bling_hub_valid_gtin_from_sku_v1(p_value text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
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
$function$;

revoke all on function private.bling_hub_valid_gtin_from_sku_v1(text) from public;


CREATE OR REPLACE FUNCTION public.enqueue_bling_hub_product_outbox_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link public.bling_hub_entity_links_v2%rowtype;
  v_operation text;
  v_gtin text;
  v_key text;
  v_payload jsonb;
begin
  if tg_op = 'UPDATE' and
     row(new.name, new.sku, new.gtin, new.ncm, new.price, new.brand, new.unit,
         new.description_short, new.description_long, new.is_active,
         coalesce(new.metadata->>'brand',''), coalesce(new.metadata->>'unit',''))
       is not distinct from
     row(old.name, old.sku, old.gtin, old.ncm, old.price, old.brand, old.unit,
         old.description_short, old.description_long, old.is_active,
         coalesce(old.metadata->>'brand',''), coalesce(old.metadata->>'unit','')) then
    return new;
  end if;

  v_gtin := regexp_replace(coalesce(new.gtin, ''), '[^0-9]', '', 'g');
  if nullif(btrim(coalesce(new.gtin, '')), '') is null
     and private.bling_hub_valid_gtin_from_sku_v1(new.sku) then
    v_gtin := btrim(new.sku);
  end if;

  select *
    into v_link
    from public.bling_hub_entity_links_v2
   where source_system = 'vitrine_qx'
     and entity_type = 'product'
     and source_id = new.id::text
   limit 1;

  if found then
    if v_link.status = 'matched' and coalesce(v_link.bling_id, 0) > 0 then
      v_operation := 'sync_product';
    elsif v_link.status = 'not_found'
      and new.is_active = true
      and length(v_gtin) in (8, 12, 13, 14) then
      v_operation := 'create_product';
    else
      return new;
    end if;
  elsif new.is_active = true and length(v_gtin) in (8, 12, 13, 14) then
    v_operation := 'create_product';
  else
    return new;
  end if;

  v_key := 'supabase:vitrine:product:' || v_operation || ':' || new.id::text || ':' ||
    to_char(coalesce(new.updated_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  v_payload := jsonb_build_object(
    'product', jsonb_build_object(
      'id', new.id,
      'sku', coalesce(new.sku, ''),
      'gtin', coalesce(nullif(btrim(new.gtin), ''), v_gtin),
      'ncm', coalesce(new.ncm, ''),
      'name', coalesce(new.name, ''),
      'description', coalesce(new.description_short, new.description_long, ''),
      'active', coalesce(new.is_active, false),
      'sale_price_cents', round(coalesce(new.price, 0) * 100)::bigint,
      'stock_quantity', coalesce(new.stock, 0),
      'image_url', coalesce(new.image_url, ''),
      'brand', coalesce(new.brand, new.metadata->>'brand', ''),
      'unit', coalesce(new.unit, new.metadata->>'unit', ''),
      'metadata', coalesce(new.metadata, '{}'::jsonb),
      'expiration_date', case when new.validity_date is null then null else to_char(new.validity_date, 'YYYY-MM-DD') end
    ),
    'requested_from', 'supabase_product_outbox_v1'
  );

  perform public.enqueue_bling_hub_job_v2(
    'product', v_operation, 'vitrine_qx', new.id::text, v_key, v_payload, 2
  );

  update public.products
     set sync_status = 'pending_bling',
         sync_error = null
   where id = new.id
     and (sync_status is distinct from 'pending_bling' or sync_error is not null);

  return new;
end
$function$;

-- Backfill only active, unlinked records whose SKU is a checksum-valid GTIN and GTIN is blank.
-- Exact GTIN/code reconciliation in the worker prevents unsafe duplicate creation.
do $function$
declare
  r record;
  v_operation text;
  v_gtin text;
  v_key text;
  v_payload jsonb;
begin
  for r in
    select p.*, l.status as link_status, l.bling_id as linked_bling_id
      from public.products p
      left join public.bling_hub_entity_links_v2 l
        on l.source_system = 'vitrine_qx'
       and l.entity_type = 'product'
       and l.source_id = p.id::text
     where p.is_active = true
       and nullif(btrim(coalesce(p.gtin, '')), '') is null
       and p.bling_product_id is null
       and private.bling_hub_valid_gtin_from_sku_v1(p.sku)
       and (l.source_id is null or l.status = 'not_found')
       and not exists (
         select 1
           from public.bling_hub_jobs_v2 j
          where j.domain = 'product'
            and j.source_system = 'vitrine_qx'
            and j.source_id = p.id::text
       )
  loop
    v_gtin := btrim(r.sku);

    if (r.link_status is null or r.link_status = 'not_found')
       and length(v_gtin) in (8, 12, 13, 14) then
      v_operation := 'create_product';
    else
      continue;
    end if;

    v_key := 'supabase:vitrine:product:sku-gtin-fallback:' || v_operation || ':' ||
      r.id::text || ':' ||
      to_char(coalesce(r.updated_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

    v_payload := jsonb_build_object(
      'product', jsonb_build_object(
        'id', r.id,
        'sku', coalesce(r.sku, ''),
        'gtin', v_gtin,
        'ncm', coalesce(r.ncm, ''),
        'name', coalesce(r.name, ''),
        'description', coalesce(r.description_short, r.description_long, ''),
        'active', coalesce(r.is_active, false),
        'sale_price_cents', round(coalesce(r.price, 0) * 100)::bigint,
        'stock_quantity', coalesce(r.stock, 0),
        'image_url', coalesce(r.image_url, ''),
        'brand', coalesce(r.brand, r.metadata->>'brand', ''),
        'unit', coalesce(r.unit, r.metadata->>'unit', ''),
        'metadata', coalesce(r.metadata, '{}'::jsonb),
        'expiration_date', case when r.validity_date is null then null else to_char(r.validity_date, 'YYYY-MM-DD') end
      ),
      'requested_from', 'supabase_product_outbox_v1_sku_gtin_backfill'
    );

    perform public.enqueue_bling_hub_job_v2(
      'product', v_operation, 'vitrine_qx', r.id::text, v_key, v_payload, 2
    );

    update public.products
       set sync_status = 'pending_bling',
           sync_error = null
     where id = r.id
       and (sync_status is distinct from 'pending_bling' or sync_error is not null);
  end loop;
end
$function$;
