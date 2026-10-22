alter table public.admin1_products
  add column if not exists brand text;

create or replace function public.admin1_save_product_v1(p_product jsonb)
returns setof public.admin1_products
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_previous_stock numeric := 0;
  v_target_stock numeric := greatest(0, coalesce(nullif(p_product->>'stock_quantity', '')::numeric, 0));
  v_delta numeric;
  v_remaining numeric;
  v_take numeric;
  v_lot public.admin1_product_lots%rowtype;
  v_lot_code text;
  v_expiration date := nullif(p_product->>'expiration_date', '')::date;
  v_is_active boolean := coalesce(nullif(p_product->>'is_active', '')::boolean, false);
  v_note text := nullif(left(coalesce(p_product->>'inventory_note', ''), 500), '');
begin
  if nullif(btrim(p_product->>'name'), '') is null then
    raise exception using errcode = '23514', message = 'Informe o nome do produto.';
  end if;
  if nullif(btrim(p_product->>'sku'), '') is null then
    raise exception using errcode = '23514', message = 'Informe o SKU do produto.';
  end if;
  if nullif(btrim(p_product->>'category'), '') is null then
    raise exception using errcode = '23514', message = 'Selecione uma categoria do Admin1.';
  end if;
  if v_is_active and v_target_stock > 0 and nullif(p_product->>'image_url', '') is null then
    raise exception using errcode = '23514', message = 'Adicione uma imagem antes de ativar o produto.';
  end if;

  v_id := nullif(p_product->>'id', '')::uuid;
  if v_id is null then
    insert into public.admin1_products (
      name, sku, gtin, commercial_gtin, tax_gtin, ncm, cest, origin_code,
      brand, packaging, category, unit, commercial_unit, tax_unit, cost,
      price_cents, stock_quantity, min_stock, gondola, shelf, supplier,
      image_url, description_short, description_long, is_active,
      source_project, source_product_id, source_imported_at
    ) values (
      btrim(p_product->>'name'), btrim(p_product->>'sku'),
      nullif(btrim(p_product->>'gtin'), ''), nullif(btrim(p_product->>'commercial_gtin'), ''),
      nullif(btrim(p_product->>'tax_gtin'), ''), nullif(btrim(p_product->>'ncm'), ''),
      nullif(btrim(p_product->>'cest'), ''), nullif(btrim(p_product->>'origin_code'), ''),
      nullif(btrim(p_product->>'brand'), ''), nullif(btrim(p_product->>'packaging'), ''),
      btrim(p_product->>'category'), nullif(btrim(p_product->>'unit'), ''),
      nullif(btrim(p_product->>'commercial_unit'), ''), nullif(btrim(p_product->>'tax_unit'), ''),
      nullif(p_product->>'cost', '')::numeric, coalesce(nullif(p_product->>'price_cents', '')::bigint, 0),
      0, coalesce(nullif(p_product->>'min_stock', '')::numeric, 0),
      nullif(btrim(p_product->>'gondola'), ''), nullif(btrim(p_product->>'shelf'), ''),
      nullif(btrim(p_product->>'supplier'), ''), nullif(p_product->>'image_url', ''),
      nullif(p_product->>'description_short', ''), nullif(p_product->>'description_long', ''), false,
      nullif(p_product->>'source_project', ''), nullif(p_product->>'source_product_id', ''),
      case when nullif(p_product->>'source_project', '') is null then null else now() end
    ) returning id into v_id;
  else
    select stock_quantity into v_previous_stock
    from public.admin1_products where id = v_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Produto não encontrado no Admin1.'; end if;

    update public.admin1_products set
      name = btrim(p_product->>'name'), sku = btrim(p_product->>'sku'),
      gtin = nullif(btrim(p_product->>'gtin'), ''),
      commercial_gtin = nullif(btrim(p_product->>'commercial_gtin'), ''),
      tax_gtin = nullif(btrim(p_product->>'tax_gtin'), ''),
      ncm = nullif(btrim(p_product->>'ncm'), ''), cest = nullif(btrim(p_product->>'cest'), ''),
      origin_code = nullif(btrim(p_product->>'origin_code'), ''), brand = nullif(btrim(p_product->>'brand'), ''),
      packaging = nullif(btrim(p_product->>'packaging'), ''), category = btrim(p_product->>'category'),
      unit = nullif(btrim(p_product->>'unit'), ''), commercial_unit = nullif(btrim(p_product->>'commercial_unit'), ''),
      tax_unit = nullif(btrim(p_product->>'tax_unit'), ''), cost = nullif(p_product->>'cost', '')::numeric,
      price_cents = coalesce(nullif(p_product->>'price_cents', '')::bigint, 0),
      min_stock = coalesce(nullif(p_product->>'min_stock', '')::numeric, 0),
      gondola = nullif(btrim(p_product->>'gondola'), ''), shelf = nullif(btrim(p_product->>'shelf'), ''),
      supplier = nullif(btrim(p_product->>'supplier'), ''), image_url = nullif(p_product->>'image_url', ''),
      description_short = nullif(p_product->>'description_short', ''),
      description_long = nullif(p_product->>'description_long', ''),
      source_project = coalesce(nullif(p_product->>'source_project', ''), source_project),
      source_product_id = coalesce(nullif(p_product->>'source_product_id', ''), source_product_id),
      source_imported_at = case when nullif(p_product->>'source_project', '') is null then source_imported_at else now() end
    where id = v_id;
  end if;

  v_delta := v_target_stock - v_previous_stock;
  if v_delta > 0 then
    v_lot_code := coalesce(nullif(btrim(p_product->>'lot_code'), ''), 'AJUSTE-' || replace(gen_random_uuid()::text, '-', ''));
    insert into public.admin1_product_lots (
      product_id, lot_code, expiration_date, received_at, received_quantity, available_quantity
    ) values (v_id, v_lot_code, v_expiration, current_date, v_delta, v_delta);
    insert into public.admin1_inventory_movements (product_id, lot_id, movement_type, quantity_delta, note)
    select v_id, id,
      case when coalesce(p_product->>'source', '') = 'purchase_xml' then 'purchase_receipt' else 'adjustment_in' end,
      v_delta, coalesce(v_note, case when coalesce(p_product->>'source', '') = 'purchase_xml' then 'Entrada conferida no XML da NF-e.' else 'Ajuste de estoque pelo Admin1.' end)
    from public.admin1_product_lots where product_id = v_id and lot_code = v_lot_code;
  elsif v_delta < 0 then
    v_remaining := abs(v_delta);
    for v_lot in
      select * from public.admin1_product_lots
      where product_id = v_id and available_quantity > 0
      order by expiration_date asc nulls last, received_at asc, created_at asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.available_quantity, v_remaining);
      update public.admin1_product_lots set available_quantity = available_quantity - v_take where id = v_lot.id;
      insert into public.admin1_inventory_movements (product_id, lot_id, movement_type, quantity_delta, note)
      values (v_id, v_lot.id, 'adjustment_out', -v_take, coalesce(v_note, 'Ajuste de estoque pelo Admin1.'));
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      raise exception using errcode = '23514', message = 'Os lotes registrados não cobrem essa redução. Confira o estoque antes de salvar.';
    end if;
  end if;

  update public.admin1_products set
    stock_quantity = v_target_stock,
    is_active = v_is_active and v_target_stock > 0
  where id = v_id;

  return query select * from public.admin1_products where id = v_id;
end;
$$;

grant execute on function public.admin1_save_product_v1(jsonb) to anon, authenticated;
