-- R08: server-authoritative quote and real staging checkout.
-- The browser sends only selections; prices, private adjustments and stock are read here.
create sequence da_next.order_number_sequence as bigint start 1;
create unique index customers_phone_digits_unique on da_next.customers (phone_digits);

create table da_next.storefront_holidays (
  holiday_date date primary key,
  label text not null check (label = btrim(label) and length(label) > 0)
);
alter table da_next.storefront_holidays enable row level security;
revoke all on table da_next.storefront_holidays from public, anon, authenticated;

create or replace function da_next.is_storefront_holiday(p_date date)
returns boolean language sql stable security invoker set search_path = pg_catalog
as $function$
  select to_char(p_date, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25')
  or exists (select 1 from da_next.storefront_holidays where holiday_date = p_date);
$function$;

create or replace function da_next.calculate_storefront_quote(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog
as $function$
declare
  v_basket_id text := btrim(p_payload->>'basketId');
  v_basket_quantity integer := coalesce((p_payload->>'basketQuantity')::integer, 1);
  v_basket_public integer := 0;
  v_private integer := 0;
  v_extras integer := 0;
  v_item_count integer := 0;
  v_total integer;
  v_line jsonb;
  v_type uuid;
  v_sku text;
  v_quantity integer;
  v_product_id uuid;
  v_unit integer;
  v_stock integer;
  v_reserved integer;
  v_city text := lower(btrim(p_payload#>>'{customer,address,city}'));
  v_delivery date := (p_payload->>'deliveryDate')::date;
  v_local timestamp := timezone('America/Cuiaba', now());
begin
  if v_basket_id = '' or v_basket_quantity <> 1 then raise exception using errcode = '22023', message = 'Cesta inválida.'; end if;
  if not exists (select 1 from da_next.basket_sizes where id = v_basket_id and active) then raise exception using errcode = '22023', message = 'Cesta indisponível.'; end if;
  if v_city not in ('cuiabá', 'cuiaba', 'várzea grande', 'varzea grande') then raise exception using errcode = '22023', message = 'Entregamos apenas em Cuiabá e Várzea Grande.'; end if;
  if p_payload#>>'{customer,address,stateCode}' <> 'MT' then raise exception using errcode = '22023', message = 'Endereço fora de Mato Grosso.'; end if;
  if regexp_replace(coalesce(p_payload#>>'{customer,phone}', ''), '[^0-9]', '', 'g') !~ '^[0-9]{10,11}$' then raise exception using errcode = '22023', message = 'WhatsApp inválido.'; end if;
  if length(btrim(coalesce(p_payload#>>'{customer,name}', ''))) < 3 then raise exception using errcode = '22023', message = 'Nome inválido.'; end if;
  if coalesce(p_payload#>>'{customer,address,postalCode}', '') !~ '^[0-9]{8}$' then raise exception using errcode = '22023', message = 'CEP inválido.'; end if;
  if coalesce(p_payload#>>'{customer,address,street}', '') = '' or coalesce(p_payload#>>'{customer,address,streetNumber}', '') = '' or coalesce(p_payload#>>'{customer,address,neighborhood}', '') = '' then raise exception using errcode = '22023', message = 'Endereço incompleto.'; end if;
  if p_payload->>'paymentMethod' not in ('PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'VALE_ALIMENTACAO', 'VALE_REFEICAO') then raise exception using errcode = '22023', message = 'Forma de pagamento inválida.'; end if;
  if v_delivery is null or extract(dow from v_delivery) = 0 or da_next.is_storefront_holiday(v_delivery) then raise exception using errcode = '22023', message = 'Data sem entrega.'; end if;
  if v_delivery = v_local::date and extract(hour from v_local) >= 12 then raise exception using errcode = '22023', message = 'O horário de corte de hoje já passou.'; end if;

  select coalesce(private_adjustment_cents, 0) into v_private from da_next.basket_size_private_pricing where basket_size_id = v_basket_id;
  if jsonb_typeof(p_payload->'basketLines') <> 'array' then raise exception using errcode = '22023', message = 'Itens da cesta inválidos.'; end if;
  for v_line in select value from jsonb_array_elements(p_payload->'basketLines') loop
    v_type := (v_line->>'typeId')::uuid;
    v_sku := btrim(v_line->>'sku');
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 999 then raise exception using errcode = '22023', message = 'Quantidade inválida.'; end if;
    if not exists (select 1 from da_next.basket_size_types line join da_next.product_types t on t.id = line.product_type_id and t.active where line.basket_size_id = v_basket_id and line.product_type_id = v_type) then raise exception using errcode = '22023', message = 'Tipo não pertence à cesta.'; end if;
    select p.id, p.price_cents, p.stock_units into v_product_id, v_unit, v_stock
      from da_next.product_type_products link join da_next.products p on p.id = link.product_id
      where link.product_type_id = v_type and p.sku = v_sku and p.active and p.price_cents > 0 and (p.valid_until is null or p.valid_until >= current_date);
    if v_product_id is null then raise exception using errcode = '22023', message = 'Produto indisponível.'; end if;
    select coalesce(sum(r.quantity), 0)::integer into v_reserved from da_next.inventory_reservations r where r.product_id = v_product_id and r.status = 'RESERVADA' and r.expires_at > now();
    if v_quantity > v_stock - v_reserved then raise exception using errcode = '22023', message = 'Estoque insuficiente.'; end if;
    v_basket_public := v_basket_public + v_unit * v_quantity;
    v_item_count := v_item_count + v_quantity;
  end loop;
  if v_item_count = 0 then raise exception using errcode = '22023', message = 'A cesta está vazia.'; end if;

  if jsonb_typeof(p_payload->'extraLines') = 'array' then
    for v_line in select value from jsonb_array_elements(p_payload->'extraLines') loop
      v_type := (v_line->>'typeId')::uuid;
      v_sku := btrim(v_line->>'sku');
      v_quantity := (v_line->>'quantity')::integer;
      if v_quantity < 1 or v_quantity > 999 then raise exception using errcode = '22023', message = 'Quantidade inválida.'; end if;
      if not exists (select 1 from da_next.basket_extra_types e where e.product_type_id = v_type and e.active) then raise exception using errcode = '22023', message = 'Extra indisponível.'; end if;
      select p.id, p.price_cents, p.stock_units into v_product_id, v_unit, v_stock
        from da_next.product_type_products link join da_next.products p on p.id = link.product_id
        where link.product_type_id = v_type and p.sku = v_sku and p.active and p.price_cents > 0 and (p.valid_until is null or p.valid_until >= current_date);
      if v_product_id is null then raise exception using errcode = '22023', message = 'Extra indisponível.'; end if;
      select coalesce(sum(r.quantity), 0)::integer into v_reserved from da_next.inventory_reservations r where r.product_id = v_product_id and r.status = 'RESERVADA' and r.expires_at > now();
      if v_quantity > v_stock - v_reserved then raise exception using errcode = '22023', message = 'Estoque insuficiente.'; end if;
      v_extras := v_extras + v_unit * v_quantity;
      v_item_count := v_item_count + v_quantity;
    end loop;
  end if;
  if v_private > v_basket_public then raise exception using errcode = '22023', message = 'Configuração de preço inválida.'; end if;
  v_total := v_basket_public + v_private + v_extras;
  if v_total < 7500 then raise exception using errcode = '22023', message = 'O pedido mínimo é de R$ 75.'; end if;
  return jsonb_build_object('totalCents', v_total, 'basketSubtotalCents', v_basket_public + v_private, 'extrasSubtotalCents', v_extras, 'itemCount', v_item_count);
end;
$function$;

create or replace function public.quote_storefront_order(p_payload jsonb)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $function$ select da_next.calculate_storefront_quote(p_payload); $function$;

create or replace function public.create_storefront_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_key text := btrim(p_payload->>'idempotencyKey');
  v_fingerprint text := md5(p_payload::text);
  v_existing da_next.orders;
  v_quote jsonb;
  v_order_id uuid;
  v_order_number text;
  v_customer_id uuid;
  v_basket_id text := btrim(p_payload->>'basketId');
  v_basket_name text;
  v_basket_code text;
  v_public integer;
  v_private integer;
  v_extras integer;
  v_total integer;
  v_line jsonb;
  v_type uuid;
  v_sku text;
  v_quantity integer;
  v_product_id uuid;
  v_product_name text;
  v_type_name text;
  v_unit integer;
  v_item_line integer := 0;
  v_basket_snapshot uuid;
  v_reserved integer;
  v_stock integer;
  v_lock uuid;
begin
  if v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then raise exception using errcode = '22023', message = 'Identificador de pedido inválido.'; end if;
  select * into v_existing from da_next.orders where request_idempotency_key = v_key for update;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception using errcode = '40001', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('orderId', v_existing.id, 'orderNumber', v_existing.order_number, 'totalCents', v_existing.total_cents::integer, 'status', v_existing.status, 'replayed', true);
  end if;
  v_quote := da_next.calculate_storefront_quote(p_payload);
  v_public := (v_quote->>'basketSubtotalCents')::integer;
  v_extras := (v_quote->>'extrasSubtotalCents')::integer;
  v_total := (v_quote->>'totalCents')::integer;
  select coalesce(private_adjustment_cents, 0) into v_private from da_next.basket_size_private_pricing where basket_size_id = v_basket_id;
  select code, name into v_basket_code, v_basket_name from da_next.basket_sizes where id = v_basket_id;
  v_order_number := 'DA-' || to_char(timezone('America/Cuiaba', now()), 'YYYYMMDD') || '-' || lpad(nextval('da_next.order_number_sequence')::text, 6, '0');
  insert into da_next.customers(display_name, phone_digits) values (btrim(p_payload#>>'{customer,name}'), regexp_replace(p_payload#>>'{customer,phone}', '[^0-9]', '', 'g'))
    on conflict (phone_digits) do update set display_name = excluded.display_name, updated_at = now() returning id into v_customer_id;
  insert into da_next.customer_addresses(customer_id, recipient_name, postal_code, street, street_number, complement, neighborhood, city, state_code, reference_note, is_default)
    values (v_customer_id, btrim(p_payload#>>'{customer,name}'), p_payload#>>'{customer,address,postalCode}', btrim(p_payload#>>'{customer,address,street}'), btrim(p_payload#>>'{customer,address,streetNumber}'), nullif(btrim(p_payload#>>'{customer,address,complement}'), ''), btrim(p_payload#>>'{customer,address,neighborhood}'), btrim(p_payload#>>'{customer,address,city}'), 'MT', nullif(btrim(p_payload#>>'{customer,address,referenceNote}'), ''), true);
  insert into da_next.orders(order_number, customer_id, customer_name_snapshot, customer_phone_snapshot, address_snapshot, payment_method, subtotal_cents, total_cents, request_idempotency_key, request_fingerprint)
    values (v_order_number, v_customer_id, btrim(p_payload#>>'{customer,name}'), regexp_replace(p_payload#>>'{customer,phone}', '[^0-9]', '', 'g'), p_payload->'customer'->'address' || jsonb_build_object('deliveryDate', p_payload->>'deliveryDate'), p_payload->>'paymentMethod', v_total, v_total, v_key, v_fingerprint) returning id into v_order_id;
  insert into da_next.order_basket_snapshots(order_id, line_number, basket_size_id, basket_code_snapshot, basket_name_snapshot, quantity, public_unit_price_cents, line_total_cents)
    values (v_order_id, 1, v_basket_id, v_basket_code, v_basket_name, 1, v_public - v_private, v_public - v_private) returning id into v_basket_snapshot;
  insert into da_next.order_basket_private_pricing(order_basket_snapshot_id, private_adjustment_cents) values (v_basket_snapshot, v_private);
  for v_line in select value from jsonb_array_elements(p_payload->'basketLines') loop
    v_type := (v_line->>'typeId')::uuid; v_sku := btrim(v_line->>'sku'); v_quantity := (v_line->>'quantity')::integer; v_item_line := v_item_line + 1;
    select p.id, p.name, t.name into v_product_id, v_product_name, v_type_name from da_next.product_type_products link join da_next.products p on p.id = link.product_id join da_next.product_types t on t.id = link.product_type_id where link.product_type_id = v_type and p.sku = v_sku;
    insert into da_next.order_basket_snapshot_types(order_basket_snapshot_id, product_type_id, type_name_snapshot, selected_quantity) values (v_basket_snapshot, v_type, v_type_name, v_quantity) on conflict do nothing;
    insert into da_next.order_items(order_id, order_basket_snapshot_id, line_number, item_kind, product_id, product_type_id, sku_snapshot, product_name_snapshot, product_type_name_snapshot, quantity) values (v_order_id, v_basket_snapshot, v_item_line, 'BASKET_COMPONENT', v_product_id, v_type, v_sku, v_product_name, v_type_name, v_quantity);
  end loop;
  if jsonb_typeof(p_payload->'extraLines') = 'array' then
    for v_line in select value from jsonb_array_elements(p_payload->'extraLines') loop
      v_type := (v_line->>'typeId')::uuid; v_sku := btrim(v_line->>'sku'); v_quantity := (v_line->>'quantity')::integer; v_item_line := v_item_line + 1;
      select p.id, p.name, p.price_cents, t.name into v_product_id, v_product_name, v_unit, v_type_name from da_next.product_type_products link join da_next.products p on p.id = link.product_id join da_next.product_types t on t.id = link.product_type_id where link.product_type_id = v_type and p.sku = v_sku;
      insert into da_next.order_items(order_id, line_number, item_kind, product_id, product_type_id, sku_snapshot, product_name_snapshot, product_type_name_snapshot, quantity, unit_price_cents, line_total_cents) values (v_order_id, v_item_line, 'EXTRA', v_product_id, v_type, v_sku, v_product_name, v_type_name, v_quantity, v_unit, v_unit * v_quantity);
    end loop;
  end if;
  -- Lock products in the same transaction as reservation creation to prevent overselling.
  for v_lock in select distinct product_id from da_next.order_items where order_id = v_order_id order by product_id loop
    perform 1 from da_next.products where id = v_lock for update;
  end loop;
  for v_lock, v_quantity in select product_id, sum(quantity)::integer from da_next.order_items where order_id = v_order_id group by product_id loop
    select stock_units into v_stock from da_next.products where id = v_lock;
    select coalesce(sum(quantity), 0)::integer into v_reserved from da_next.inventory_reservations where product_id = v_lock and status = 'RESERVADA' and expires_at > now();
    if v_quantity > v_stock - v_reserved then raise exception using errcode = '40001', message = 'Estoque insuficiente.'; end if;
    insert into da_next.inventory_reservations(order_id, product_id, quantity, expires_at) values (v_order_id, v_lock, v_quantity, now() + interval '30 minutes');
  end loop;
  return jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'totalCents', v_total, 'status', 'NOVO', 'replayed', false);
exception when unique_violation then
  select * into v_existing from da_next.orders where request_idempotency_key = v_key;
  if found and v_existing.request_fingerprint = v_fingerprint then
    return jsonb_build_object('orderId', v_existing.id, 'orderNumber', v_existing.order_number, 'totalCents', v_existing.total_cents::integer, 'status', v_existing.status, 'replayed', true);
  end if;
  raise;
end;
$function$;

revoke all on function public.quote_storefront_order(jsonb) from public, anon, authenticated;
revoke all on function public.create_storefront_order(jsonb) from public, anon, authenticated;
grant execute on function public.quote_storefront_order(jsonb) to anon, authenticated;
grant execute on function public.create_storefront_order(jsonb) to anon, authenticated;
comment on function public.create_storefront_order(jsonb) is 'V2 staging checkout: server pricing, stock reservation and idempotent public receipt; no private fields returned.';
