create or replace function public.admin1_save_basket_v1(p_basket jsonb)
returns setof public.admin1_baskets
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_sort_order integer := 0;
  v_is_active boolean := coalesce(nullif(p_basket->>'is_active', '')::boolean, false);
  v_items jsonb := coalesce(p_basket->'items', '[]'::jsonb);
  v_name text := btrim(coalesce(p_basket->>'name', ''));
  v_sku text := btrim(coalesce(p_basket->>'sku', ''));
  v_image text := nullif(p_basket->>'image_url', '');
begin
  if v_name = '' then raise exception using errcode = '23514', message = 'Informe o nome da cesta.'; end if;
  if v_sku = '' then raise exception using errcode = '23514', message = 'Informe o SKU da cesta.'; end if;
  if jsonb_typeof(v_items) <> 'array' then raise exception using errcode = '23514', message = 'A composição da cesta está inválida.'; end if;
  if v_is_active and v_image is null then raise exception using errcode = '23514', message = 'Adicione uma imagem antes de ativar a cesta.'; end if;
  if v_is_active and jsonb_array_length(v_items) = 0 then raise exception using errcode = '23514', message = 'Adicione ao menos um produto antes de ativar a cesta.'; end if;

  v_id := nullif(p_basket->>'id', '')::uuid;
  if v_id is null then
    insert into public.admin1_baskets (sku, name, description, image_url, price_cents, is_active)
    values (v_sku, v_name, nullif(btrim(p_basket->>'description'), ''), v_image,
      greatest(0, coalesce(nullif(p_basket->>'price_cents', '')::bigint, 0)), false)
    returning id into v_id;
  else
    perform 1 from public.admin1_baskets where id = v_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Cesta não encontrada no Admin1.'; end if;
    update public.admin1_baskets set
      sku = v_sku,
      name = v_name,
      description = nullif(btrim(p_basket->>'description'), ''),
      image_url = v_image,
      price_cents = greatest(0, coalesce(nullif(p_basket->>'price_cents', '')::bigint, 0)),
      is_active = false,
      updated_at = now()
    where id = v_id;
  end if;

  delete from public.admin1_basket_items where basket_id = v_id;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;
    if v_product_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception using errcode = '23514', message = 'Cada item precisa de produto e quantidade maior que zero.';
    end if;
    if not exists (select 1 from public.admin1_products where id = v_product_id) then
      raise exception using errcode = '23503', message = 'Um produto da composição não existe no catálogo do Admin1.';
    end if;
    insert into public.admin1_basket_items (basket_id, product_id, quantity, sort_order)
    values (v_id, v_product_id, v_quantity, v_sort_order);
    v_sort_order := v_sort_order + 1;
  end loop;

  if v_is_active then
    if exists (
      select 1 from public.admin1_basket_items bi
      join public.admin1_products p on p.id = bi.product_id
      where bi.basket_id = v_id and (not p.is_active or p.stock_quantity <= 0)
    ) then
      raise exception using errcode = '23514', message = 'A cesta não pode ser ativada: revise os produtos da composição sem estoque ou inativos.';
    end if;
    update public.admin1_baskets set is_active = true, updated_at = now() where id = v_id;
  end if;

  return query select * from public.admin1_baskets where id = v_id;
end;
$$;

grant execute on function public.admin1_save_basket_v1(jsonb) to anon, authenticated;
