-- R16 V2 synthetic seed rollback.
-- Execute manually only against hjudhofluihkxykwekir after homologation.
-- If order or stock-history rows reference the seed, archive it instead of deleting history.
-- The isolated PGlite test exercises both branches; it never connects to Supabase.

begin;

do $r16$
begin
  if
    exists (
      select 1
      from da_next.order_basket_snapshots
      where basket_size_id = 'r16-test'
    )
    or exists (
      select 1
      from da_next.order_basket_snapshot_types
      where product_type_id in (
        '00000000-0000-4000-8000-000000000271',
        '00000000-0000-4000-8000-000000000272',
        '00000000-0000-4000-8000-000000000273'
      )
    )
    or exists (
      select 1
      from da_next.order_items
      where product_type_id in (
        '00000000-0000-4000-8000-000000000271',
        '00000000-0000-4000-8000-000000000272',
        '00000000-0000-4000-8000-000000000273'
      )
      or product_id in (
        select id
        from da_next.products
        where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
      )
    )
    or exists (
      select 1
      from da_next.inventory_reservations
      where product_id in (
        select id
        from da_next.products
        where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
      )
    )
    or exists (
      select 1
      from da_next.product_stock_movements
      where product_id in (
        select id
        from da_next.products
        where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
      )
      and idempotency_key not in (
        'r16-seed-arroz-v1',
        'r16-seed-feijao-v1',
        'r16-seed-oleo-v1'
      )
    )
    or exists (
      select 1
      from da_next.product_type_products link
      join da_next.products product on product.id = link.product_id
      where (
        link.product_type_id in (
          '00000000-0000-4000-8000-000000000271',
          '00000000-0000-4000-8000-000000000272',
          '00000000-0000-4000-8000-000000000273'
        )
        or product.sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
      )
      and not (
        link.product_type_id in (
          '00000000-0000-4000-8000-000000000271',
          '00000000-0000-4000-8000-000000000272',
          '00000000-0000-4000-8000-000000000273'
        )
        and product.sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
      )
    )
    or exists (
      select 1
      from da_next.basket_size_types
      where product_type_id in (
        '00000000-0000-4000-8000-000000000271',
        '00000000-0000-4000-8000-000000000272',
        '00000000-0000-4000-8000-000000000273'
      )
      and basket_size_id <> 'r16-test'
    )
  then
    update da_next.products
    set active = false
    where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO');

    update da_next.product_types
    set active = false
    where id in (
      '00000000-0000-4000-8000-000000000271',
      '00000000-0000-4000-8000-000000000272',
      '00000000-0000-4000-8000-000000000273'
    );

    update da_next.basket_sizes
    set active = false
    where id = 'r16-test';
  else
    delete from da_next.product_stock_movements
    where idempotency_key in (
      'r16-seed-arroz-v1',
      'r16-seed-feijao-v1',
      'r16-seed-oleo-v1'
    );

    delete from da_next.basket_extra_types
    where product_type_id in (
      '00000000-0000-4000-8000-000000000271',
      '00000000-0000-4000-8000-000000000272',
      '00000000-0000-4000-8000-000000000273'
    );

    delete from da_next.basket_size_types
    where basket_size_id = 'r16-test';

    delete from da_next.basket_size_private_pricing
    where basket_size_id = 'r16-test';

    delete from da_next.basket_sizes
    where id = 'r16-test';

    delete from da_next.product_type_products
    where product_type_id in (
      '00000000-0000-4000-8000-000000000271',
      '00000000-0000-4000-8000-000000000272',
      '00000000-0000-4000-8000-000000000273'
    );

    delete from da_next.bling_product_profiles
    where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO');

    delete from da_next.product_types
    where id in (
      '00000000-0000-4000-8000-000000000271',
      '00000000-0000-4000-8000-000000000272',
      '00000000-0000-4000-8000-000000000273'
    );

    delete from da_next.products
    where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO');
  end if;
end;
$r16$;

commit;
