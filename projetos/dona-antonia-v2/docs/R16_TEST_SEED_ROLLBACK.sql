-- R16 V2 synthetic seed rollback
-- Execute only against hjudhofluihkxykwekir after homologation.
-- This removes only deterministic R16 seed rows; it does not touch imported catalog rows.

begin;

delete from da_next.product_stock_movements
where idempotency_key in ('r16-seed-arroz-v1','r16-seed-feijao-v1','r16-seed-oleo-v1');

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

delete from da_next.product_types
where id in (
  '00000000-0000-4000-8000-000000000271',
  '00000000-0000-4000-8000-000000000272',
  '00000000-0000-4000-8000-000000000273'
);

delete from da_next.bling_product_profiles
where sku in ('R16-TEST-ARROZ','R16-TEST-FEIJAO','R16-TEST-OLEO');

delete from da_next.products
where sku in ('R16-TEST-ARROZ','R16-TEST-FEIJAO','R16-TEST-OLEO');

commit;
