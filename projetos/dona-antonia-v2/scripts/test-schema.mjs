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
  'basket_configuration_state',
  'basket_size_private_pricing',
  'basket_extra_types',
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
  'order_basket_private_pricing',
  'order_basket_snapshot_types',
  'order_commands',
  'order_events',
  'order_items',
  'product_stock_movements',
  'product_type_products',
  'product_types',
  'products',
  'staff_role_assignments',
  'storefront_holidays',
  'orders',
].sort();

assert.equal(migrations.length, 12, 'the schema must be a complete, ordered migration chain');
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
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO PUBLIC;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
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
      (select count(*) from pg_policies where schemaname = 'da_next') as policies,
      has_table_privilege('anon', 'da_next.products', 'SELECT') as anon_products,
      has_function_privilege('anon', 'public.get_my_staff_role()', 'EXECUTE') as anon_role_lookup,
      has_function_privilege('authenticated', 'public.get_my_staff_role()', 'EXECUTE') as staff_role_lookup,
      has_function_privilege('anon', 'public.admin_list_products(text,text,text,integer,integer)', 'EXECUTE') as anon_product_list,
      has_function_privilege('authenticated', 'public.admin_list_products(text,text,text,integer,integer)', 'EXECUTE') as staff_product_list,
      has_function_privilege('authenticated', 'public.admin_save_product(uuid,bigint,jsonb,uuid,text)', 'EXECUTE') as staff_product_save,
      has_function_privilege('authenticated', 'public.admin_list_product_stock_movements(uuid,integer)', 'EXECUTE') as staff_stock_history,
      has_function_privilege('anon', 'public.admin_get_product_private_profile(uuid)', 'EXECUTE') as anon_private_profile,
      has_function_privilege('authenticated', 'public.admin_get_product_private_profile(uuid)', 'EXECUTE') as staff_private_profile,
      has_function_privilege('authenticated', 'public.admin_save_product_private_profile(uuid,bigint,jsonb,uuid)', 'EXECUTE') as staff_private_profile_save
      ,has_function_privilege('anon', 'public.admin_get_basket_configuration()', 'EXECUTE') as anon_basket_read
      ,has_function_privilege('authenticated', 'public.admin_get_basket_configuration()', 'EXECUTE') as staff_basket_read
      ,has_function_privilege('anon', 'public.get_storefront_catalog()', 'EXECUTE') as anon_public_catalog
      ,has_function_privilege('anon', 'public.admin_save_basket_configuration(jsonb,bigint)', 'EXECUTE') as anon_basket_save
      ,has_function_privilege('authenticated', 'public.admin_save_basket_configuration(jsonb,bigint)', 'EXECUTE') as staff_basket_save
      ,has_function_privilege('anon', 'public.quote_storefront_order(jsonb)', 'EXECUTE') as anon_checkout_quote
      ,has_function_privilege('anon', 'public.create_storefront_order(jsonb)', 'EXECUTE') as anon_checkout_create
      ,has_function_privilege('authenticated', 'public.quote_storefront_order(jsonb)', 'EXECUTE') as staff_checkout_quote
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'da_next' and c.relkind = 'r'
  `);
  assert.equal(access.rows[0].anon_schema, false);
  assert.equal(access.rows[0].authenticated_schema, true);
  assert.equal(access.rows[0].service_schema, true);
  assert.equal(Number(access.rows[0].tables_with_rls), expectedTables.length);
  assert.ok(Number(access.rows[0].policies) > expectedTables.length);
  assert.equal(access.rows[0].anon_products, false);
  assert.equal(access.rows[0].anon_checkout_quote, true);
  assert.equal(access.rows[0].anon_checkout_create, true);
  assert.equal(access.rows[0].staff_checkout_quote, true);
  assert.equal(access.rows[0].anon_role_lookup, false);
  assert.equal(access.rows[0].staff_role_lookup, true);
  assert.equal(access.rows[0].anon_product_list, false);
  assert.equal(access.rows[0].staff_product_list, true);
  assert.equal(access.rows[0].staff_product_save, true);
  assert.equal(access.rows[0].staff_stock_history, true);
  assert.equal(access.rows[0].anon_private_profile, false);
  assert.equal(access.rows[0].staff_private_profile, true);
  assert.equal(access.rows[0].staff_private_profile_save, true);
  assert.equal(access.rows[0].anon_basket_read, false);
  assert.equal(access.rows[0].staff_basket_read, true);
  assert.equal(access.rows[0].anon_public_catalog, true);
  assert.equal(access.rows[0].anon_basket_save, false);
  assert.equal(access.rows[0].staff_basket_save, true);

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
  await db.query(
    `insert into da_next.bling_product_profiles
       (sku, purchase_cost_cents, purchase_cost_exact, original_import_fields)
     values ('ARROZ-5KG', 812, 8.1234, '{"Preço de custo":"8,1234"}'::jsonb)`,
  );
  const exactCost = await db.query(
    'select purchase_cost_cents, purchase_cost_exact::text from da_next.bling_product_profiles where sku = $1',
    ['ARROZ-5KG'],
  );
  assert.equal(exactCost.rows[0].purchase_cost_cents, 812);
  assert.equal(exactCost.rows[0].purchase_cost_exact, '8.1234');

  const staffId = '00000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users (id) values ($1)', [staffId]);
  await db.query(
    `insert into da_next.staff_role_assignments (user_id, role)
     values ($1, 'ADMIN'::da_next.staff_role)`,
    [staffId],
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [staffId]);
  const listed = await db.query(
    `select public.admin_list_products('ARROZ-5KG', null, 'todos', 30, 0) as result`,
  );
  assert.equal(listed.rows[0].result.total, 1);
  assert.equal(listed.rows[0].result.items[0].sku, 'ARROZ-5KG');
  assert.equal(JSON.stringify(listed.rows[0].result).includes('purchase_cost'), false);

  const stockRequestId = '00000000-0000-4000-8000-000000000101';
  const savedStock = await db.query(
    `select public.admin_save_product($1, 1, '{"stock_units":15}'::jsonb, $2, 'Contagem física') as result`,
    [productId, stockRequestId],
  );
  assert.equal(savedStock.rows[0].result.stock_units, 15);
  assert.equal(savedStock.rows[0].result.revision, 2);
  const stockMovement = await db.query(
    'select delta_units, reason, actor_id, note from da_next.product_stock_movements where idempotency_key = $1',
    [stockRequestId],
  );
  assert.equal(stockMovement.rows[0].delta_units, -5);
  assert.equal(stockMovement.rows[0].reason, 'AJUSTE_MANUAL');
  assert.equal(stockMovement.rows[0].actor_id, staffId);
  assert.equal(stockMovement.rows[0].note, 'Contagem física');

  const retryStock = await db.query(
    `select public.admin_save_product($1, 1, '{"stock_units":15}'::jsonb, $2, 'Contagem física') as result`,
    [productId, stockRequestId],
  );
  assert.equal(retryStock.rows[0].result.stock_units, 15);
  const movementCount = await db.query(
    'select count(*)::integer as count from da_next.product_stock_movements where idempotency_key = $1',
    [stockRequestId],
  );
  assert.equal(movementCount.rows[0].count, 1);

  await expectSqlFailure(
    `select public.admin_save_product('${productId}', 1, '{"active":true}'::jsonb, '00000000-0000-4000-8000-000000000102', null)`,
    'stale product revisions must be rejected',
  );
  await expectSqlFailure(
    `select public.admin_save_product('${productId}', 2, '{"stock_units":-1}'::jsonb, '00000000-0000-4000-8000-000000000103', 'Contagem')`,
    'negative stock must be rejected through the authenticated product RPC',
  );

  const history = await db.query(
    'select public.admin_list_product_stock_movements($1, 50) as result',
    [productId],
  );
  assert.equal(history.rows[0].result.length, 1);
  assert.equal(history.rows[0].result[0].delta_units, -5);

  const privateProfile = await db.query(
    'select public.admin_get_product_private_profile($1) as result',
    [productId],
  );
  assert.equal(privateProfile.rows[0].result.purchase_cost_exact, '8.1234');
  assert.equal(privateProfile.rows[0].result.supplier_name, null);
  const savedProfile = await db.query(
    `select public.admin_save_product_private_profile($1, 1, '{"supplier_name":"Distribuidor Teste","purchase_cost_exact":"8.1234"}'::jsonb, '00000000-0000-4000-8000-000000000111') as result`,
    [productId],
  );
  assert.equal(savedProfile.rows[0].result.revision, 2);
  assert.equal(savedProfile.rows[0].result.supplier_name, 'Distribuidor Teste');

  const configurationTypeId = '11111111-1111-4111-8111-111111111111';
  const basketConfiguration = {
    types: [
      {
        id: configurationTypeId,
        name: 'Arroz da cesta',
        order: 1,
        active: true,
        productSkus: ['ARROZ-5KG'],
      },
    ],
    baskets: [
      {
        id: 'mini',
        code: 'MINI',
        name: 'Mini',
        order: 1,
        active: true,
        privateAdjustmentCents: 250,
        lines: [{ typeId: configurationTypeId, defaultQuantity: 2, order: 1 }],
      },
    ],
    extras: [{ typeId: configurationTypeId, order: 1, active: true }],
  };
  const savedConfiguration = await db.query(
    'select public.admin_save_basket_configuration($1::jsonb, 1) as result',
    [JSON.stringify(basketConfiguration)],
  );
  assert.equal(
    savedConfiguration.rows[0].result.types.find((type) => type.id === configurationTypeId).name,
    'Arroz da cesta',
  );
  const savedMini = savedConfiguration.rows[0].result.baskets.find(
    (basket) => basket.id === 'mini',
  );
  assert.equal(savedMini.privateAdjustmentCents, 250);
  assert.equal(savedMini.lines[0].defaultQuantity, 2);
  assert.equal(savedConfiguration.rows[0].result.extras[0].active, true);
  assert.equal(savedConfiguration.rows[0].result.revision, 2);
  await expectSqlFailure(
    `select public.admin_save_basket_configuration('${JSON.stringify(basketConfiguration).replaceAll("'", "''")}'::jsonb, 1) as result`,
    'stale basket configuration revisions must be rejected',
  );
  await db.query('update da_next.products set active = true where id = $1', [productId]);
  await db.exec('SET ROLE anon');
  const publicCatalog = await db.query('select public.get_storefront_catalog() as result');
  await db.exec('RESET ROLE');
  const publicBasket = publicCatalog.rows[0].result.baskets.find((basket) => basket.id === 'mini');
  assert.equal(publicBasket.startingTotalCents, 5430);
  assert.equal(JSON.stringify(publicCatalog.rows[0].result).includes('privateAdjustment'), false);

  const checkoutPayload = {
    basketId: 'mini',
    basketQuantity: 1,
    basketLines: [{ typeId: configurationTypeId, sku: 'ARROZ-5KG', quantity: 2 }],
    extraLines: [{ typeId: configurationTypeId, sku: 'ARROZ-5KG', quantity: 1 }],
    customer: {
      name: 'Cliente Checkout',
      phone: '65988887777',
      address: {
        recipientName: 'Cliente Checkout',
        postalCode: '78000000',
        street: 'Rua Teste',
        streetNumber: '10',
        complement: '',
        neighborhood: 'Centro',
        city: 'Cuiabá',
        stateCode: 'MT',
        referenceNote: '',
      },
    },
    paymentMethod: 'PIX',
    deliveryDate: '2026-10-26',
    idempotencyKey: 'checkout-schema-test-1234',
  };
  await db.exec('SET ROLE anon');
  const checkoutQuote = await db.query(
    'select public.quote_storefront_order($1::jsonb) as result',
    [JSON.stringify(checkoutPayload)],
  );
  assert.ok(checkoutQuote.rows[0].result.totalCents >= 7500);
  assert.equal(
    checkoutQuote.rows[0].result.totalCents,
    checkoutQuote.rows[0].result.basketSubtotalCents +
      checkoutQuote.rows[0].result.extrasSubtotalCents,
  );
  assert.equal(JSON.stringify(checkoutQuote.rows[0].result).includes('private'), false);
  const checkoutReceipt = await db.query(
    'select public.create_storefront_order($1::jsonb) as result',
    [JSON.stringify(checkoutPayload)],
  );
  assert.equal(checkoutReceipt.rows[0].result.status, 'NOVO');
  assert.equal(checkoutReceipt.rows[0].result.replayed, false);
  const checkoutRetry = await db.query(
    'select public.create_storefront_order($1::jsonb) as result',
    [JSON.stringify(checkoutPayload)],
  );
  assert.equal(checkoutRetry.rows[0].result.replayed, true);
  assert.equal(
    checkoutRetry.rows[0].result.orderNumber,
    checkoutReceipt.rows[0].result.orderNumber,
  );
  await db.exec('RESET ROLE');

  const productStaffId = '00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users (id) values ($1)', [productStaffId]);
  await db.query(
    `insert into da_next.staff_role_assignments (user_id, role)
     values ($1, 'PRODUCTS'::da_next.staff_role)`,
    [productStaffId],
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [productStaffId]);
  const productStaffBasketConfig = await db.query(
    'select public.admin_get_basket_configuration() as result',
  );
  assert.equal(
    productStaffBasketConfig.rows[0].result.baskets.find((basket) => basket.id === 'mini')
      .privateAdjustmentCents,
    null,
  );
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await expectSqlFailure(
    `select public.admin_get_basket_configuration()`,
    'anonymous users cannot read basket configuration',
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [productStaffId]);
  await expectSqlFailure(
    `select public.admin_get_product_private_profile('${productId}')`,
    'product operators must not read private cost or supplier profile',
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [staffId]);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await expectSqlFailure(
    `select public.admin_list_products(null, null, 'todos', 30, 0)`,
    'anonymous users must not call the admin catalog RPC',
  );
  await expectSqlFailure(
    `update da_next.bling_product_profiles set purchase_cost_exact = -0.0001 where sku = 'ARROZ-5KG'`,
    'negative exact purchase cost must be rejected',
  );
  await expectSqlFailure(
    `insert into da_next.products (sku, name, category, gtin) values ('DUP-SKU', 'Duplicado GTIN', 'MERCEARIA BÁSICA', '7891234567895')`,
    'duplicate GTIN must be rejected',
  );
  await expectSqlFailure(
    `insert into da_next.products (sku, name, category, stock_units) values ('INVALIDO', 'Produto inválido', 'OUTRA', -1)`,
    'invalid category and negative stock must be rejected',
  );
  await db.query(
    `update da_next.basket_size_private_pricing
     set private_adjustment_cents = 500 where basket_size_id = 'mini'`,
  );
  await expectSqlFailure(
    `update da_next.basket_size_private_pricing
     set private_adjustment_cents = -1 where basket_size_id = 'mini'`,
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
       quantity, public_unit_price_cents, line_total_cents
     ) values ($1, 1, 'mini', 'MINI', 'Mini', 1, 5000, 5000) returning id`,
    [orderId],
  );
  await db.query(
    `insert into da_next.order_basket_private_pricing
       (order_basket_snapshot_id, private_adjustment_cents)
     values ($1, 500)`,
    [basket.rows[0].id],
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

  const actorIds = {
    admin: '10000000-0000-4000-8000-000000000001',
    products: '10000000-0000-4000-8000-000000000002',
    separation: '10000000-0000-4000-8000-000000000003',
    support: '10000000-0000-4000-8000-000000000004',
    unassigned: '10000000-0000-4000-8000-000000000005',
  };
  await db.query(
    'insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)',
    Object.values(actorIds),
  );
  await db.query(
    `insert into da_next.staff_role_assignments (user_id, role)
     values ($1, 'ADMIN'), ($2, 'PRODUCTS'), ($3, 'SEPARATION'), ($4, 'SUPPORT')`,
    [actorIds.admin, actorIds.products, actorIds.separation, actorIds.support],
  );
  await db.query(
    `insert into da_next.conversations (
       provider_account, external_contact_id, customer_phone_snapshot
     ) values ('0975', 'support-test-contact', '65999999999')`,
  );

  async function asAuthenticated(userId, run) {
    await db.exec('SET ROLE authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try {
      return await run();
    } finally {
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec('RESET ROLE');
    }
  }

  const roleLookup = await asAuthenticated(actorIds.products, () =>
    db.query('select public.get_my_staff_role() as role'),
  );
  assert.equal(roleLookup.rows[0].role, 'PRODUCTS');
  const missingRoleLookup = await asAuthenticated(actorIds.unassigned, () =>
    db.query('select public.get_my_staff_role() as role'),
  );
  assert.equal(missingRoleLookup.rows[0].role, null);

  const catalogAccess = await asAuthenticated(actorIds.products, async () => {
    await db.query(
      'select set_config(\'request.jwt.claims\', \'{"user_metadata":{"role":"ADMIN"}}\', false)',
    );
    const visibleProducts = await db.query('select id from da_next.products');
    const hiddenOrders = await db.query('select id from da_next.orders');
    const hiddenPrivatePrices = await db.query(
      'select basket_size_id from da_next.basket_size_private_pricing',
    );
    const changed = await db.query(
      'update da_next.products set price_cents = 2690 where id = $1 returning price_cents',
      [productId],
    );
    await expectSqlFailure(
      `update da_next.products set stock_units = 999 where id = '${productId}'`,
      'catalog operators must not change stock outside the stock ledger service',
    );
    await expectSqlFailure(
      'select private_adjustment_cents from da_next.basket_sizes',
      'private pricing must not be a column on the catalog table',
    );
    return { visibleProducts, hiddenOrders, hiddenPrivatePrices, changed };
  });
  assert.equal(catalogAccess.visibleProducts.rows.length, 1);
  assert.equal(catalogAccess.hiddenOrders.rows.length, 0);
  assert.equal(catalogAccess.hiddenPrivatePrices.rows.length, 0);
  assert.equal(catalogAccess.changed.rows[0].price_cents, 2690);

  const separationAccess = await asAuthenticated(actorIds.separation, async () => {
    const visibleOrders = await db.query('select id from da_next.orders');
    const hiddenCatalog = await db.query('select id from da_next.products');
    const hiddenPricing = await db.query(
      'select order_basket_snapshot_id from da_next.order_basket_private_pricing',
    );
    const attemptedProductUpdate = await db.query(
      'update da_next.products set price_cents = 1 where id = $1 returning id',
      [productId],
    );
    return { visibleOrders, hiddenCatalog, hiddenPricing, attemptedProductUpdate };
  });
  assert.equal(separationAccess.visibleOrders.rows.length, 2);
  assert.equal(separationAccess.hiddenCatalog.rows.length, 0);
  assert.equal(separationAccess.hiddenPricing.rows.length, 0);
  assert.equal(separationAccess.attemptedProductUpdate.rows.length, 0);

  const supportAccess = await asAuthenticated(actorIds.support, async () => {
    const visibleConversations = await db.query('select id from da_next.conversations');
    const visibleOrders = await db.query('select id from da_next.orders');
    const hiddenProducts = await db.query('select id from da_next.products');
    const hiddenPrivateProfiles = await db.query('select sku from da_next.bling_product_profiles');
    return { visibleConversations, visibleOrders, hiddenProducts, hiddenPrivateProfiles };
  });
  assert.equal(supportAccess.visibleConversations.rows.length, 1);
  assert.equal(supportAccess.visibleOrders.rows.length, 2);
  assert.equal(supportAccess.hiddenProducts.rows.length, 0);
  assert.equal(supportAccess.hiddenPrivateProfiles.rows.length, 0);

  const adminAccess = await asAuthenticated(actorIds.admin, async () => {
    const privatePricing = await db.query(
      'select private_adjustment_cents from da_next.basket_size_private_pricing where basket_size_id = $1',
      ['mini'],
    );
    const orderPricing = await db.query(
      'select private_adjustment_cents from da_next.order_basket_private_pricing where order_basket_snapshot_id = $1',
      [basket.rows[0].id],
    );
    const visibleCatalog = await db.query('select id from da_next.products');
    return { privatePricing, orderPricing, visibleCatalog };
  });
  assert.equal(adminAccess.privatePricing.rows[0].private_adjustment_cents, 500);
  assert.equal(adminAccess.orderPricing.rows[0].private_adjustment_cents, 500);
  assert.equal(adminAccess.visibleCatalog.rows.length, 1);

  const noRoleAccess = await asAuthenticated(actorIds.unassigned, async () => {
    const products = await db.query('select id from da_next.products');
    const orders = await db.query('select id from da_next.orders');
    return { products, orders };
  });
  assert.equal(noRoleAccess.products.rows.length, 0);
  assert.equal(noRoleAccess.orders.rows.length, 0);

  await asAuthenticated(actorIds.products, async () => {
    await expectSqlFailure(
      `insert into da_next.staff_role_assignments (user_id, role, created_by)
       values ('${actorIds.unassigned}', 'ADMIN', '${actorIds.products}')`,
      'catalog operators must not grant staff roles',
    );
  });
  await asAuthenticated(actorIds.admin, async () => {
    await db.query(
      `insert into da_next.staff_role_assignments (user_id, role, created_by)
       values ($1, 'SUPPORT', $2)`,
      [actorIds.unassigned, actorIds.admin],
    );
    await db.query(
      `update da_next.staff_role_assignments
       set revoked_at = now(), revoked_by = $1
       where user_id = $2 and revoked_at is null`,
      [actorIds.admin, actorIds.unassigned],
    );
  });
  const revokedAccess = await asAuthenticated(actorIds.unassigned, async () =>
    db.query('select id from da_next.conversations'),
  );
  assert.equal(revokedAccess.rows.length, 0, 'revoked roles must lose access immediately');
  const revokedRoleLookup = await asAuthenticated(actorIds.unassigned, () =>
    db.query('select public.get_my_staff_role() as role'),
  );
  assert.equal(revokedRoleLookup.rows[0].role, null, 'role lookup must reflect revocation');

  await db.exec('SET ROLE anon');
  await expectSqlFailure(
    'select id from da_next.products',
    'anonymous users must not access the private schema',
  );
  await db.exec('RESET ROLE');

  console.log(
    `PostgreSQL isolado: ${migrations.length} migrações, ${expectedTables.length} tabelas, RLS/RBAC positivo e negativo, privacidade e rollback verificados.`,
  );
} finally {
  await db.close();
}
