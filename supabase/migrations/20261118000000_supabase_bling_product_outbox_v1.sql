-- Supabase is the authoritative product and stock catalog. Keep Bling as a verified mirror.
create or replace function public.enqueue_bling_hub_product_outbox_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
      'gtin', coalesce(new.gtin, ''),
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

create or replace function public.enqueue_bling_hub_stock_outbox_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link public.bling_hub_entity_links_v2%rowtype;
  v_key text;
begin
  if tg_op = 'UPDATE' and new.stock is not distinct from old.stock then
    return new;
  end if;

  select *
    into v_link
    from public.bling_hub_entity_links_v2
   where source_system = 'vitrine_qx'
     and entity_type = 'product'
     and source_id = new.id::text
   limit 1;

  if not found or v_link.status <> 'matched' or coalesce(v_link.bling_id, 0) <= 0 then
    return new;
  end if;

  v_key := 'supabase:vitrine:stock:' || new.id::text || ':' ||
    to_char(coalesce(new.updated_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  perform public.enqueue_bling_hub_job_v2(
    'stock',
    'set_stock',
    'vitrine_qx',
    new.id::text,
    v_key,
    jsonb_build_object('stock_quantity', coalesce(new.stock, 0), 'authority', 'supabase'),
    1
  );

  return new;
end
$function$;

create or replace function public.enqueue_bling_stock_after_product_link_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_product_id uuid;
  v_stock numeric;
begin
  if tg_op = 'UPDATE'
     and new.bling_id is not distinct from old.bling_id
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.source_system <> 'vitrine_qx'
     or new.entity_type <> 'product'
     or new.status <> 'matched'
     or coalesce(new.bling_id, 0) <= 0 then
    return new;
  end if;

  begin
    v_product_id := new.source_id::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  select stock into v_stock
    from public.products
   where id = v_product_id;

  if not found then
    return new;
  end if;

  perform public.enqueue_bling_hub_job_v2(
    'stock',
    'set_stock',
    'vitrine_qx',
    v_product_id::text,
    'supabase:vitrine:stock:linked:' || v_product_id::text || ':' || new.bling_id::text,
    jsonb_build_object('stock_quantity', coalesce(v_stock, 0), 'authority', 'supabase'),
    1
  );

  return new;
end
$function$;

create or replace function public.project_bling_hub_product_sync_status_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_product_id uuid;
  v_bling_id bigint;
  v_id_text text;
begin
  if new.domain <> 'product'
     or new.source_system <> 'vitrine_qx'
     or new.status not in ('synced', 'review_required', 'retry', 'failed')
     or (tg_op = 'UPDATE' and new.status is not distinct from old.status) then
    return new;
  end if;

  begin
    v_product_id := new.source_id::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  v_id_text := coalesce(new.result->>'bling_id', new.provider_id);
  if v_id_text ~ '^[0-9]+$' then
    v_bling_id := v_id_text::bigint;
  end if;

  if v_bling_id is null then
    select bling_id into v_bling_id
      from public.bling_hub_entity_links_v2
     where source_system = 'vitrine_qx'
       and entity_type = 'product'
       and source_id = v_product_id::text
       and status = 'matched'
     limit 1;
  end if;

  if new.status = 'synced' then
    update public.products
       set bling_product_id = coalesce(v_bling_id, bling_product_id),
           sync_status = 'synced',
           last_bling_sync_at = coalesce(new.finished_at, new.updated_at, now()),
           sync_error = null
     where id = v_product_id;
  else
    update public.products
       set sync_status = 'pending_bling',
           sync_error = coalesce(new.error_message, new.error_code, 'Bling product sync requires review')
     where id = v_product_id;
  end if;

  return new;
end
$function$;

drop trigger if exists products_bling_catalog_outbox_v1 on public.products;
create trigger products_bling_catalog_outbox_v1
after insert or update of name, sku, gtin, ncm, price, brand, unit,
  description_short, description_long, is_active, metadata
on public.products
for each row execute function public.enqueue_bling_hub_product_outbox_v1();

drop trigger if exists products_bling_stock_outbox_v1 on public.products;
create trigger products_bling_stock_outbox_v1
after insert or update of stock
on public.products
for each row execute function public.enqueue_bling_hub_stock_outbox_v1();

drop trigger if exists bling_product_link_stock_outbox_v1 on public.bling_hub_entity_links_v2;
create trigger bling_product_link_stock_outbox_v1
after insert or update of bling_id, status
on public.bling_hub_entity_links_v2
for each row execute function public.enqueue_bling_stock_after_product_link_v1();

drop trigger if exists bling_product_job_sync_status_v1 on public.bling_hub_jobs_v2;
create trigger bling_product_job_sync_status_v1
after update of status
on public.bling_hub_jobs_v2
for each row
when (old.status is distinct from new.status)
execute function public.project_bling_hub_product_sync_status_v1();

-- Queue the active products explicitly marked as pending and active unlinked products
-- with an EAN so they are reconciled from Supabase using the existing identity checks.
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
       and (
         p.sync_status = 'pending_bling'
         or (p.sync_status = 'local' and l.source_id is null)
         or (p.sync_status = 'local' and l.status = 'not_found')
       )
  loop
    v_gtin := regexp_replace(coalesce(r.gtin, ''), '[^0-9]', '', 'g');

    if r.link_status = 'matched' and coalesce(r.linked_bling_id, 0) > 0 then
      v_operation := 'sync_product';
    elsif (r.link_status is null or r.link_status = 'not_found')
      and length(v_gtin) in (8, 12, 13, 14) then
      v_operation := 'create_product';
    else
      continue;
    end if;

    v_key := 'supabase:vitrine:product:backfill:' || v_operation || ':' || r.id::text || ':' ||
      to_char(coalesce(r.updated_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

    v_payload := jsonb_build_object(
      'product', jsonb_build_object(
        'id', r.id,
        'sku', coalesce(r.sku, ''),
        'gtin', coalesce(r.gtin, ''),
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
      'requested_from', 'supabase_product_outbox_v1_backfill'
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
