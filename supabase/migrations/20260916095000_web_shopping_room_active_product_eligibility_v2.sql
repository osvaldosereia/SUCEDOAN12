-- Chat Comprar: produtos ativos no Admin são elegíveis para venda web.
-- `physically_verified` continua como dado operacional de conferência, mas não é
-- um segundo interruptor de publicação do catálogo. A venda ainda exige produto
-- ativo, preço válido e respeita o estoque disponível e o limite por cliente.

create or replace function public.set_cart_web_addon_quantity(
  p_cart_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_price numeric;
  v_stock integer;
  v_limit integer;
begin
  if p_quantity is null or p_quantity < 0 or trunc(p_quantity) <> p_quantity then
    raise exception 'invalid_quantity';
  end if;
  if p_quantity > 6 then
    raise exception 'quantity_exceeds_customer_limit';
  end if;

  perform 1
    from public.carts
   where id = p_cart_id
     and status = 'draft';
  if not found then
    raise exception 'cart_not_editable';
  end if;

  select price, greatest(0, floor(coalesce(stock,0))::integer)
    into v_price, v_stock
    from public.products
   where id = p_product_id
     and is_active = true
     and coalesce(price,0) > 0;
  if not found then
    raise exception 'product_not_available';
  end if;

  v_limit := least(6, v_stock);
  if p_quantity > v_limit then
    raise exception 'quantity_exceeds_stock';
  end if;

  delete from public.cart_items
   where cart_id = p_cart_id
     and product_id = p_product_id
     and source = 'addon';

  if p_quantity > 0 then
    insert into public.cart_items(
      cart_id, product_id, source, quantity, unit_price, line_total,
      commercial_unit_price, metadata
    )
    values(
      p_cart_id,
      p_product_id,
      'addon',
      p_quantity,
      coalesce(v_price,0),
      p_quantity * coalesce(v_price,0),
      coalesce(v_price,0),
      jsonb_build_object(
        'pricing_source','product_price',
        'source','web_shopping_room',
        'customer_quantity_cap',6,
        'stock_at_write',v_stock
      )
    );
  end if;

  return public.recalculate_cart(p_cart_id);
end;
$function$;

revoke execute on function public.set_cart_web_addon_quantity(uuid,uuid,numeric)
  from public,anon,authenticated;
