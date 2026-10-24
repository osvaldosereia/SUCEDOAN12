import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrations = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
const expectedTables = [
  'audit_log',
  'basket_size_types',
  'basket_sizes',
  'bling_product_profiles',
  'conversation_messages',
  'conversations',
  'customer_addresses',
  'customers',
  'fiscal_documents',
  'integration_outbox',
  'inventory_reservations',
  'order_basket_snapshots',
  'order_basket_snapshot_types',
  'order_commands',
  'order_events',
  'order_items',
  'product_stock_movements',
  'product_type_products',
  'product_types',
  'products',
  'orders',
].sort();

assert.equal(migrations.length, 4, 'the schema must be a complete, ordered migration chain');
assert.ok(migrations.every((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file)));

const db = new PGlite();

async function expectSqlFailure(sql, label) {
  await db.exec('BEGIN');
  await assert.rejects(() => db.exec(sql), undefined, label);
  await db.exec('ROLLBACK');
}

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  `);

  for (const migration of migrations) {
    await db.exec(await readFile(path.join(migrationDir, migration), 'utf8'));
  }

  const tableResult = await db.query(
    "select table_name from information_schema.tables where table_schema = 'da_next' and table_type = 'BASE TABLE' order by table_name",
  );
  assert.deepEqual(
    tableResult.rows.map((row) => row.table_name),
    expectedTables,
    'every planned table must be created in the isolated schema',
  );

  const access = await db.query(`
    select
      has_schema_privilege('anon', 'da_next', 'USAGE') as anon_schema,
      has_schema_privilege('authenticated', 'da_next', 'USAGE') as authenticated_schema,
      has_schema_privilege('service_role', 'da_next', 'USAGE') as service_schema,
      count(*) filter (where c.relrowsecurity) as tables_with_rls,
      (select count(*) from pg_policies where schemaname = 'da_next') as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'da_next' and c.relkind = 'r'
  `);
  assert.equal(access.rows[0].anon_schema, false);
  assert.equal(access.rows[0].authenticated_schema, false);
  assert.equal(access.rows[0].service_schema, true);
  assert.equal(Number(access.rows[0].tables_with_rls), expectedTables.length);
  assert.equal(Number(access.rows[0].policies), 0, 'R02 stays deny-by-default until R03 RBAC');

  const basketSeed = await db.query('select id from da_next.basket_sizes order by sort_order');
  assert.deepEqual(
    basketSeed.rows.map((row) => row.id),
    ['economica', 'mini', 'pequena', 'media', 'grande'],
  );

  const product = await db.query(
    `insert into da_next.products (sku, name, category, gtin, price_cents, stock_units)
     values ('ARROZ-5KG', 'ARROZ TIPO 1 5 KG', 'MERCEARIA BÁSICA', '7891234567895', 2590, 20)
     returning id`,
  );
  const productId = product.rows[0].id;
  await expectSqlFailure(
    `insert into da_next.products (sku, name, category, gtin) values ('DUP-SKU', 'Duplicado GTIN', 'MERCEARIA BÁSICA', '7891234567895')`,
    'duplicate GTIN must be rejected',
  );
  await expectSqlFailure(
    `insert into da_next.products (sku, name, category, stock_units) values ('INVALIDO', 'Produto inválido', 'OUTRA', -1)`,
    'invalid category and negative stock must be rejected',
  );
  await expectSqlFailure(
    `update da_next.basket_sizes set private_adjustment_cents = -1 where id = 'mini'`,
    'negative private adjustment must be rejected',
  );

  const type = await db.query(
    `insert into da_next.product_types (name) values ('Arroz') returning id`,
  );
  const typeId = type.rows[0].id;
  await db.query(
    `insert into da_next.product_type_products (product_type_id, product_id) values ($1, $2)`,
    [typeId, productId],
  );

  const order = await db.query(
    `insert into da_next.orders (
       order_number, customer_name_snapshot, customer_phone_snapshot, address_snapshot,
       payment_method, subtotal_cents, total_cents, request_idempotency_key, request_fingerprint
     ) values (
       'DA-2026-000001', 'Cliente de teste', '65999999999',
       '{"city":"Cuiabá","state":"MT"}', 'PIX', 5200, 5200, 'checkout-test-1', 'hash-1'
     ) returning id`,
  );
  const orderId = order.rows[0].id;
  const basket = await db.query(
    `insert into da_next.order_basket_snapshots (
       order_id, line_number, basket_size_id, basket_code_snapshot, basket_name_snapshot,
       quantity, public_unit_price_cents, private_adjustment_cents, line_total_cents
     ) values ($1, 1, 'mini', 'MINI', 'Mini', 1, 5000, 500, 5000) returning id`,
    [orderId],
  );
  await db.query(
    `insert into da_next.order_basket_snapshot_types (
       order_basket_snapshot_id, product_type_id, type_name_snapshot, selected_quantity
     ) values ($1, $2, 'Arroz', 2)`,
    [basket.rows[0].id, typeId],
  );
  await db.query(
    `insert into da_next.order_items (
       order_id, order_basket_snapshot_id, line_number, item_kind, product_id,
       product_type_id, sku_snapshot, product_name_snapshot, product_type_name_snapshot, quantity
     ) values ($1, $2, 1, 'BASKET_COMPONENT', $3, $4, 'ARROZ-5KG', 'ARROZ TIPO 1 5 KG', 'Arroz', 2)`,
    [orderId, basket.rows[0].id, productId, typeId],
  );
  await db.query(
    `insert into da_next.order_items (
       order_id, line_number, item_kind, product_id, product_type_id, sku_snapshot,
       product_name_snapshot, product_type_name_snapshot, quantity, unit_price_cents, line_total_cents
     ) values ($1, 2, 'EXTRA', $2, $3, 'ARROZ-5KG', 'ARROZ TIPO 1 5 KG', 'Arroz', 2, 100, 200)`,
    [orderId, productId, typeId],
  );
  await expectSqlFailure(
    `insert into da_next.order_items (
       order_id, line_number, item_kind, product_id, product_type_id, sku_snapshot,
       product_name_snapshot, product_type_name_snapshot, quantity, unit_price_cents, line_total_cents
     ) values ('${orderId}', 3, 'EXTRA', '${productId}', '${typeId}', 'ARROZ-5KG', 'ARROZ TIPO 1 5 KG', 'Arroz', 2, 100, 199)`,
    'extra line total must equal unit price multiplied by quantity',
  );
  await expectSqlFailure(
    `insert into da_next.order_items (
       order_id, order_basket_snapshot_id, line_number, item_kind, product_id, product_type_id,
       sku_snapshot, product_name_snapshot, product_type_name_snapshot, quantity, unit_price_cents
     ) values ('${orderId}', '${basket.rows[0].id}', 3, 'BASKET_COMPONENT', '${productId}', '${typeId}', 'ARROZ-5KG', 'ARROZ TIPO 1 5 KG', 'Arroz', 1, 999)`,
    'basket components must not persist a customer-facing unit price',
  );

  await db.query(
    `insert into da_next.inventory_reservations (order_id, product_id, quantity, expires_at)
     values ($1, $2, 3, now() + interval '10 minutes')`,
    [orderId, productId],
  );
  await expectSqlFailure(
    `insert into da_next.inventory_reservations (order_id, product_id, quantity, expires_at)
     values ('${orderId}', '${productId}', 1, now() + interval '10 minutes')`,
    'an order can reserve a product only once after quantities are consolidated',
  );

  await db.query(
    `insert into da_next.order_commands (
       order_id, command_id, request_fingerprint, command_type, expected_version, result_version
     ) values ($1, 'command-1', 'hash-1', 'START', 1, 2)`,
    [orderId],
  );
  await expectSqlFailure(
    `insert into da_next.order_commands (
       order_id, command_id, request_fingerprint, command_type, expected_version, result_version
     ) values ('${orderId}', 'command-1', 'hash-1', 'START', 1, 2)`,
    'duplicate order command must be rejected',
  );

  await db.query(
    `insert into da_next.integration_outbox (
       aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key
     ) values ('ORDER', $1, 1, 'OrderCreated', 'order-created-1')`,
    [orderId],
  );
  await db.query(
    `insert into da_next.fiscal_documents (order_id, idempotency_key)
     values ($1, 'invoice-order-1')`,
    [orderId],
  );
  await expectSqlFailure(
    `insert into da_next.fiscal_documents (order_id, idempotency_key)
     values ('${orderId}', 'invoice-order-duplicate')`,
    'only one non-cancelled fiscal document may exist per order',
  );

  await db.exec('begin');
  await db.exec(`
    insert into da_next.orders (
      order_number, customer_name_snapshot, customer_phone_snapshot, address_snapshot,
      payment_method, subtotal_cents, total_cents, request_idempotency_key, request_fingerprint
    ) values (
      'DA-2026-ROLLBACK', 'Cliente temporário', '65999999999',
      '{"city":"Cuiabá","state":"MT"}', 'PIX', 100, 100, 'checkout-rollback', 'hash-rollback'
    )
  `);
  await db.exec('rollback');
  const rolledBack = await db.query(
    `select count(*)::int as count from da_next.orders where order_number = 'DA-2026-ROLLBACK'`,
  );
  assert.equal(rolledBack.rows[0].count, 0, 'the isolated database must roll back a transaction');

  console.log(
    `PostgreSQL isolado: ${migrations.length} migrações aplicadas, ${expectedTables.length} tabelas com RLS fechado, constraints, idempotência e rollback verificados.`,
  );
} finally {
  await db.close();
}
