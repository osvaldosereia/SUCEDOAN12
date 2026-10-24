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
  'whatsapp_utility_messages',
  'whatsapp_utility_settings',
  'whatsapp_utility_templates',
  'customer_addresses',
  'customers',
  'delivery_events',
  'fiscal_documents',
  'fiscal_document_events',
  'fiscal_document_items',
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

assert.equal(migrations.length, 20, 'the schema must be a complete, ordered migration chain');
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
      ,has_function_privilege('anon', 'public.admin_list_conversations(text,text,text,integer,integer)', 'EXECUTE') as anon_conversation_list
      ,has_function_privilege('authenticated', 'public.admin_list_conversations(text,text,text,integer,integer)', 'EXECUTE') as staff_conversation_list
      ,has_function_privilege('authenticated', 'public.admin_get_conversation(uuid)', 'EXECUTE') as staff_conversation_get
      ,has_function_privilege('authenticated', 'public.admin_queue_conversation_message(uuid,text,text,text,jsonb)', 'EXECUTE') as staff_conversation_queue
      ,has_function_privilege('anon', 'public.admin_list_whatsapp_utility_messages(text,text,text,integer,integer)', 'EXECUTE') as anon_utility_list
      ,has_function_privilege('authenticated', 'public.admin_list_whatsapp_utility_messages(text,text,text,integer,integer)', 'EXECUTE') as staff_utility_list
      ,has_function_privilege('authenticated', 'public.admin_record_whatsapp_utility_result(uuid,text,text,text)', 'EXECUTE') as staff_utility_result
      ,has_function_privilege('anon', 'public.admin_request_fiscal_document(uuid,uuid,jsonb)', 'EXECUTE') as anon_fiscal_request
      ,has_function_privilege('authenticated', 'public.admin_request_fiscal_document(uuid,uuid,jsonb)', 'EXECUTE') as staff_fiscal_request
      ,has_function_privilege('authenticated', 'public.admin_record_fiscal_result(uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE') as staff_fiscal_result
      ,has_function_privilege('anon', 'public.admin_get_basket_configuration()', 'EXECUTE') as anon_basket_read
      ,has_function_privilege('authenticated', 'public.admin_get_basket_configuration()', 'EXECUTE') as staff_basket_read
      ,has_function_privilege('anon', 'public.get_storefront_catalog()', 'EXECUTE') as anon_public_catalog
      ,has_function_privilege('anon', 'public.admin_save_basket_configuration(jsonb,bigint)', 'EXECUTE') as anon_basket_save
      ,has_function_privilege('authenticated', 'public.admin_save_basket_configuration(jsonb,bigint)', 'EXECUTE') as staff_basket_save
      ,has_function_privilege('anon', 'public.quote_storefront_order(jsonb)', 'EXECUTE') as anon_checkout_quote
      ,has_function_privilege('anon', 'public.create_storefront_order(jsonb)', 'EXECUTE') as anon_checkout_create
      ,has_function_privilege('authenticated', 'public.quote_storefront_order(jsonb)', 'EXECUTE') as staff_checkout_quote
      ,has_function_privilege('anon', 'public.admin_list_orders(text,text,integer,integer)', 'EXECUTE') as anon_order_list
      ,has_function_privilege('authenticated', 'public.admin_list_orders(text,text,integer,integer)', 'EXECUTE') as staff_order_list
      ,has_function_privilege('anon', 'public.admin_get_order(uuid)', 'EXECUTE') as anon_order_detail
      ,has_function_privilege('authenticated', 'public.admin_get_order(uuid)', 'EXECUTE') as staff_order_detail
      ,has_function_privilege('anon', 'public.admin_apply_order_command(uuid,text,jsonb,integer)', 'EXECUTE') as anon_order_command
      ,has_function_privilege('authenticated', 'public.admin_apply_order_command(uuid,text,jsonb,integer)', 'EXECUTE') as staff_order_command
      ,has_function_privilege('anon', 'public.admin_list_customers(text,integer,integer)', 'EXECUTE') as anon_customer_list
      ,has_function_privilege('authenticated', 'public.admin_list_customers(text,integer,integer)', 'EXECUTE') as staff_customer_list
      ,has_function_privilege('authenticated', 'public.admin_get_customer(uuid)', 'EXECUTE') as staff_customer_get
      ,has_function_privilege('anon', 'public.admin_get_operational_report(date,date)', 'EXECUTE') as anon_report
      ,has_function_privilege('authenticated', 'public.admin_get_operational_report(date,date)', 'EXECUTE') as staff_report
      ,has_function_privilege('anon', 'public.admin_record_delivery_outcome(uuid,uuid,text,text)', 'EXECUTE') as anon_delivery_record
      ,has_function_privilege('authenticated', 'public.admin_record_delivery_outcome(uuid,uuid,text,text)', 'EXECUTE') as staff_delivery_record
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
  assert.equal(access.rows[0].anon_order_list, false);
  assert.equal(access.rows[0].staff_order_list, true);
  assert.equal(access.rows[0].anon_order_detail, false);
  assert.equal(access.rows[0].staff_order_detail, true);
  assert.equal(access.rows[0].anon_order_command, false);
  assert.equal(access.rows[0].staff_order_command, true);
  assert.equal(access.rows[0].anon_customer_list, false);
  assert.equal(access.rows[0].staff_customer_list, true);
  assert.equal(access.rows[0].staff_customer_get, true);
  assert.equal(access.rows[0].anon_report, false);
  assert.equal(access.rows[0].staff_report, true);
  assert.equal(access.rows[0].anon_delivery_record, false);
  assert.equal(access.rows[0].staff_delivery_record, true);
  assert.equal(access.rows[0].anon_role_lookup, false);
  assert.equal(access.rows[0].staff_role_lookup, true);
  assert.equal(access.rows[0].anon_product_list, false);
  assert.equal(access.rows[0].staff_product_list, true);
  assert.equal(access.rows[0].staff_product_save, true);
  assert.equal(access.rows[0].staff_stock_history, true);
  assert.equal(access.rows[0].anon_private_profile, false);
  assert.equal(access.rows[0].staff_private_profile, true);
  assert.equal(access.rows[0].staff_private_profile_save, true);
  assert.equal(access.rows[0].anon_conversation_list, false);
  assert.equal(access.rows[0].staff_conversation_list, true);
  assert.equal(access.rows[0].staff_conversation_get, true);
  assert.equal(access.rows[0].staff_conversation_queue, true);
  assert.equal(access.rows[0].anon_utility_list, false);
  assert.equal(access.rows[0].staff_utility_list, true);
  assert.equal(access.rows[0].staff_utility_result, true);
  assert.equal(access.rows[0].anon_fiscal_request, false);
  assert.equal(access.rows[0].staff_fiscal_request, true);
  assert.equal(access.rows[0].staff_fiscal_result, true);
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

  const startResult = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-start', '{"type":"START"}'::jsonb, 1) as result`,
      [orderId],
    ),
  );
  assert.equal(startResult.rows[0].result.status, 'EM_SEPARACAO');
  assert.equal(startResult.rows[0].result.version, 2);
  assert.equal(startResult.rows[0].result.assigned_to, actorIds.separation);

  await asAuthenticated(actorIds.admin, async () => {
    await expectSqlFailure(
      `select public.admin_apply_order_command('${orderId}', 'r10-wrong-claim', '{"type":"MARK","itemId":"${basket.rows[0].id}","result":"FALTOU"}'::jsonb, 2)`,
      'another operator must not edit a claimed order',
    );
  });

  const basketItem = await db.query(
    `select id from da_next.order_items where order_id = $1 and item_kind = 'BASKET_COMPONENT'`,
    [orderId],
  );

  const basketMissing = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-basket-missing', $2::jsonb, 2) as result`,
      [
        orderId,
        JSON.stringify({
          type: 'MARK',
          itemId: basketItem.rows[0].id,
          result: 'FALTOU',
        }),
      ],
    ),
  );
  assert.equal(basketMissing.rows[0].result.version, 3);
  assert.ok(basketMissing.rows[0].result.total_cents >= 0);
  const failedItemMark = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-basket-missing', $2::jsonb, 2) as result`,
      [
        orderId,
        JSON.stringify({
          type: 'MARK',
          itemId: basketItem.rows[0].id,
          result: 'FALTOU',
        }),
      ],
    ),
  );
  assert.equal(
    failedItemMark.rows[0].result.version,
    3,
    'retry must return the same command result',
  );

  const extra = await db.query(
    `select id from da_next.order_items where order_id = $1 and item_kind = 'EXTRA'`,
    [orderId],
  );
  const extraSeparated = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-extra-separated', $2::jsonb, 3) as result`,
      [
        orderId,
        JSON.stringify({
          type: 'MARK',
          itemId: extra.rows[0].id,
          result: 'SEPARADO',
        }),
      ],
    ),
  );
  assert.equal(extraSeparated.rows[0].result.version, 4);
  assert.equal(extraSeparated.rows[0].result.total_cents, 200);

  const ready = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-finish', '{"type":"FINISH"}'::jsonb, 4) as result`,
      [orderId],
    ),
  );
  assert.equal(ready.rows[0].result.status, 'PRONTO');
  assert.equal(ready.rows[0].result.fiscal_status, 'PENDENTE');
  assert.ok(ready.rows[0].result.total_cents >= 0);

  const delivered = await asAuthenticated(actorIds.separation, () =>
    db.query(
      `select public.admin_apply_order_command($1, 'r10-deliver', '{"type":"DELIVER"}'::jsonb, 5) as result`,
      [orderId],
    ),
  );
  assert.equal(delivered.rows[0].result.status, 'ENTREGUE');
  await db.query(
    `update da_next.bling_product_profiles
     set ncm = '10063021', cest = null, origin_code = '0'
     where sku = 'ARROZ-5KG'`,
  );
  const commandAudit = await db.query(
    `select
       (select count(*)::int from da_next.order_events where order_id = $1) as events,
       (select count(*)::int from da_next.audit_log where entity_id = $1::text and entity_type = 'ORDER' and action like 'ORDER_COMMAND_%') as audit`,
    [orderId],
  );
  assert.equal(commandAudit.rows[0].events, 5);
  assert.equal(commandAudit.rows[0].audit, 5);

  const roleLookup = await asAuthenticated(actorIds.products, () =>
    db.query('select public.get_my_staff_role() as role'),
  );
  assert.equal(roleLookup.rows[0].role, 'PRODUCTS');
  const missingRoleLookup = await asAuthenticated(actorIds.unassigned, () =>
    db.query('select public.get_my_staff_role() as role'),
  );
  assert.equal(missingRoleLookup.rows[0].role, null);

  await db.query(
    `delete from da_next.fiscal_documents where order_id = $1 and idempotency_key = 'invoice-order-1'`,
    [orderId],
  );
  const fiscalContext = {
    destination_uf: 'MT',
    cfop: '5102',
    tax_situation_code: '102',
    tax_regime: 'SIMPLES_NACIONAL',
  };
  const fiscalRequest = await asAuthenticated(actorIds.admin, () =>
    db.query(`select public.admin_request_fiscal_document($1, $2, $3::jsonb) as result`, [
      orderId,
      '00000000-0000-4000-8000-000000000201',
      JSON.stringify(fiscalContext),
    ]),
  );
  assert.equal(fiscalRequest.rows[0].result.status, 'PENDENTE');
  assert.equal(fiscalRequest.rows[0].result.item_count, 2);
  assert.equal(fiscalRequest.rows[0].result.replayed, false);
  const fiscalDocumentId = fiscalRequest.rows[0].result.id;
  const fiscalReplay = await asAuthenticated(actorIds.admin, () =>
    db.query(`select public.admin_request_fiscal_document($1, $2, $3::jsonb) as result`, [
      orderId,
      '00000000-0000-4000-8000-000000000201',
      JSON.stringify(fiscalContext),
    ]),
  );
  assert.equal(fiscalReplay.rows[0].result.id, fiscalDocumentId);
  assert.equal(fiscalReplay.rows[0].result.replayed, true);
  const fiscalOutbox = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select count(*)::int as count
       from da_next.integration_outbox
       where aggregate_type = 'FISCAL_DOCUMENT' and aggregate_id = $1`,
      [fiscalDocumentId],
    ),
  );
  assert.equal(fiscalOutbox.rows[0].count, 1);
  const fiscalError = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select public.admin_record_fiscal_result(
        $1, 'ERRO', null, null, null, null, 'HTTP_429', 'Limite simulado', '{"httpStatus":429}'::jsonb
      ) as result`,
      [fiscalDocumentId],
    ),
  );
  assert.equal(fiscalError.rows[0].result.status, 'ERRO');
  assert.equal(fiscalError.rows[0].result.attempts, 1);
  const fiscalOrderState = await db.query(
    `select status, fiscal_status from da_next.orders where id = $1`,
    [orderId],
  );
  assert.equal(fiscalOrderState.rows[0].status, 'ENTREGUE');
  assert.equal(fiscalOrderState.rows[0].fiscal_status, 'ERRO');
  const fiscalRetry = await asAuthenticated(actorIds.admin, () =>
    db.query(`select public.admin_request_fiscal_document($1, $2, $3::jsonb) as result`, [
      orderId,
      '00000000-0000-4000-8000-000000000202',
      JSON.stringify(fiscalContext),
    ]),
  );
  assert.equal(fiscalRetry.rows[0].result.id, fiscalDocumentId);
  assert.equal(fiscalRetry.rows[0].result.status, 'PENDENTE');
  const fiscalIssued = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select public.admin_record_fiscal_result(
        $1, 'EMITIDA', 'BLING-NFE-1', '123', '1',
        '35261012345678000199550010000001231234567890', null, null, '{"status":"autorizada"}'::jsonb
      ) as result`,
      [fiscalDocumentId],
    ),
  );
  assert.equal(fiscalIssued.rows[0].result.status, 'EMITIDA');
  assert.equal(fiscalIssued.rows[0].result.replayed, false);
  const fiscalIssuedReplay = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select public.admin_record_fiscal_result(
        $1, 'EMITIDA', 'BLING-NFE-1', '123', '1',
        '35261012345678000199550010000001231234567890', null, null, '{}'::jsonb
      ) as result`,
      [fiscalDocumentId],
    ),
  );
  assert.equal(fiscalIssuedReplay.rows[0].result.replayed, true);
  const fiscalCounts = await db.query(
    `select
       (select count(*)::int from da_next.fiscal_documents where order_id = $1) as documents,
       (select count(*)::int from da_next.integration_outbox where aggregate_type = 'FISCAL_DOCUMENT' and aggregate_id = $2) as outbox,
       (select count(*)::int from da_next.fiscal_document_events where fiscal_document_id = $2) as events`,
    [orderId, fiscalDocumentId],
  );
  assert.equal(
    fiscalCounts.rows[0].documents,
    1,
    'retries must not create duplicate fiscal documents',
  );
  assert.equal(fiscalCounts.rows[0].outbox, 2, 'retry must create only one new outbox attempt');
  assert.equal(fiscalCounts.rows[0].events, 3);

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
    return {
      visibleOrders,
      hiddenCatalog,
      hiddenPricing,
      attemptedProductUpdate,
    };
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
    return {
      visibleConversations,
      visibleOrders,
      hiddenProducts,
      hiddenPrivateProfiles,
    };
  });
  assert.equal(supportAccess.visibleConversations.rows.length, 1);
  assert.equal(supportAccess.visibleOrders.rows.length, 2);
  assert.equal(supportAccess.hiddenProducts.rows.length, 0);
  assert.equal(supportAccess.hiddenPrivateProfiles.rows.length, 0);

  await db.query(
    `update da_next.whatsapp_utility_settings
     set enabled = true, daily_budget = 10
     where provider_account = '0975'`,
  );
  await db.query(
    `update da_next.whatsapp_utility_templates
     set approval_status = 'APROVADO', active = true
     where provider_account = '0975' and event_type = 'OrderReady'`,
  );
  await db.query(
    `insert into da_next.order_events (order_id, version, event_type, actor_id, event_data)
     values ($1, 6, 'OrderReady', $2, '{"source":"r12-db-test"}'::jsonb)`,
    [orderId, actorIds.separation],
  );
  const utilityRead = await asAuthenticated(actorIds.support, () =>
    db.query(
      `select public.admin_list_whatsapp_utility_messages('0975', 'NA_FILA', 'DA-2026-000001', 20, 0) as result`,
    ),
  );
  const utilityMessageId = utilityRead.rows[0].result.items[0].id;
  assert.equal(utilityRead.rows[0].result.total, 1);
  assert.equal(utilityRead.rows[0].result.items[0].event_type, 'OrderReady');
  const utilityFailures = await asAuthenticated(actorIds.support, async () => {
    const first = await db.query(
      `select public.admin_record_whatsapp_utility_result($1, 'FALHA', null, 'TEMPORARIO') as result`,
      [utilityMessageId],
    );
    const second = await db.query(
      `select public.admin_record_whatsapp_utility_result($1, 'FALHA', null, 'TEMPORARIO') as result`,
      [utilityMessageId],
    );
    const final = await db.query(
      `select public.admin_record_whatsapp_utility_result($1, 'FALHA', null, 'LIMITE_TENTATIVAS') as result`,
      [utilityMessageId],
    );
    return { first, second, final };
  });
  assert.equal(utilityFailures.first.rows[0].result.delivery_status, 'NA_FILA');
  assert.equal(utilityFailures.first.rows[0].result.attempts, 1);
  assert.equal(utilityFailures.second.rows[0].result.attempts, 2);
  assert.equal(utilityFailures.final.rows[0].result.delivery_status, 'FALHA_FINAL');
  assert.equal(utilityFailures.final.rows[0].result.attempts, 3);
  const utilityOutbox = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select count(*)::int as count
       from da_next.integration_outbox
       where aggregate_type = 'ORDER' and aggregate_id = $1 and event_type = 'WhatsAppUtilityQueued'`,
      [orderId],
    ),
  );
  assert.equal(utilityOutbox.rows[0].count, 1, 'utility enqueue must be idempotent');
  await db.query(
    `insert into da_next.order_events (order_id, version, event_type, actor_id, event_data)
     values ($1, 7, 'OrderDelivered', $2, '{"source":"r12-budget-test"}'::jsonb)`,
    [orderId, actorIds.separation],
  );
  const utilityBudget = await db.query(
    `select count(*)::int as count from da_next.whatsapp_utility_messages
     where order_id = $1 and provider_account = '0975'`,
    [orderId],
  );
  assert.equal(utilityBudget.rows[0].count, 1, 'daily budget must prevent a second enqueue');

  const conversationId = (
    await db.query(
      `select id from da_next.conversations where external_contact_id = 'support-test-contact'`,
    )
  ).rows[0].id;
  const inboxRead = await asAuthenticated(actorIds.support, async () => {
    const page = await db.query(
      `select public.admin_list_conversations('0975', 'ABERTA', 'support-test', 20, 0) as result`,
    );
    const detail = await db.query('select public.admin_get_conversation($1) as result', [
      conversationId,
    ]);
    const queued = await db.query(
      `select public.admin_queue_conversation_message($1, '0975', 'r11-message-1', 'Teste V2', '[{"type":"audio","mimeType":"audio/ogg"}]'::jsonb) as result`,
      [conversationId],
    );
    const replayed = await db.query(
      `select public.admin_queue_conversation_message($1, '0975', 'r11-message-1', 'Teste V2', '[{"type":"audio","mimeType":"audio/ogg"}]'::jsonb) as result`,
      [conversationId],
    );
    const messages = await db.query(
      `select count(*)::int as count from da_next.conversation_messages`,
    );
    return { page, detail, queued, replayed, messages };
  });
  const inboxOutbox = await asAuthenticated(actorIds.admin, () =>
    db.query(
      `select count(*)::int as count from da_next.integration_outbox where aggregate_type = 'CONVERSATION' and aggregate_id = $1`,
      [conversationId],
    ),
  );
  assert.equal(inboxRead.page.rows[0].result.total, 1);
  assert.equal(inboxRead.page.rows[0].result.items[0].provider_account, '0975');
  assert.equal(inboxRead.detail.rows[0].result.messages.length, 0);
  assert.equal(inboxRead.queued.rows[0].result.delivery_status, 'NA_FILA');
  assert.equal(inboxRead.queued.rows[0].result.replayed, false);
  assert.equal(inboxRead.replayed.rows[0].result.replayed, true);
  assert.equal(inboxOutbox.rows[0].count, 1);

  const orderRead = await asAuthenticated(actorIds.support, async () => {
    const page = await db.query(
      `select public.admin_list_orders('ENTREGUE', 'DA-2026-000001', 20, 0) as result`,
    );
    const detail = await db.query('select public.admin_get_order($1) as result', [orderId]);
    return { page, detail };
  });
  assert.equal(orderRead.page.rows[0].result.total, 1);
  assert.equal(orderRead.page.rows[0].result.items[0].order_number, 'DA-2026-000001');
  assert.equal(orderRead.detail.rows[0].result.items[0].unit_price_cents, null);
  assert.equal(
    JSON.stringify(orderRead.detail.rows[0].result).includes('private_adjustment'),
    false,
  );

  const customer = await db.query(
    `insert into da_next.customers (display_name, phone_digits)
     values ('Cliente Histórico', '65911112222') returning id`,
  );
  const customerId = customer.rows[0].id;
  await db.query(
    `insert into da_next.customer_addresses (
       customer_id, recipient_name, postal_code, street, street_number,
       neighborhood, city, state_code, is_default
     ) values ($1, 'Cliente Histórico', '78000000', 'Rua Persistente', '22',
       'Centro', 'Cuiabá', 'MT', true)`,
    [customerId],
  );
  await db.query('update da_next.orders set customer_id = $1 where id = $2', [customerId, orderId]);
  const customerRead = await asAuthenticated(actorIds.support, async () => {
    const page = await db.query(`select public.admin_list_customers('6591111', 20, 0) as result`);
    const detail = await db.query('select public.admin_get_customer($1) as result', [customerId]);
    const report = await db.query(
      `select public.admin_get_operational_report('2026-10-01', '2026-10-31') as result`,
    );
    return { page, detail, report };
  });
  assert.equal(customerRead.page.rows[0].result.total, 1);
  assert.equal(customerRead.page.rows[0].result.items[0].display_name, 'Cliente Histórico');
  assert.equal(customerRead.detail.rows[0].result.addresses[0].isDefault, true);
  assert.equal(customerRead.detail.rows[0].result.orders[0].number, 'DA-2026-000001');
  assert.equal(customerRead.report.rows[0].result.ordersTotal, 2);
  assert.ok(customerRead.report.rows[0].result.byStatus.ENTREGUE >= 1);

  const deliveryOutcome = await asAuthenticated(actorIds.separation, async () => {
    const first = await db.query(
      `select public.admin_record_delivery_outcome($1, $2, 'CONCLUIDA', 'Recebido pelo cliente') as result`,
      [orderId, '00000000-0000-4000-8000-000000000301'],
    );
    const replayed = await db.query(
      `select public.admin_record_delivery_outcome($1, $2, 'CONCLUIDA', 'Recebido pelo cliente') as result`,
      [orderId, '00000000-0000-4000-8000-000000000301'],
    );
    return { first, replayed };
  });
  assert.equal(deliveryOutcome.first.rows[0].result.delivery_status, 'CONCLUIDA');
  assert.equal(deliveryOutcome.first.rows[0].result.replayed, false);
  assert.equal(deliveryOutcome.replayed.rows[0].result.replayed, true);
  const deliveryEvents = await db.query(
    'select count(*)::int as count from da_next.delivery_events where order_id = $1',
    [orderId],
  );
  assert.equal(deliveryEvents.rows[0].count, 1);
  await asAuthenticated(actorIds.unassigned, async () => {
    await expectSqlFailure(
      `select public.admin_get_customer('${customerId}')`,
      'unassigned users must not read customer data',
    );
  });

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

  const r16RollbackSql = await readFile(
    path.join(root, 'docs', 'R16_TEST_SEED_ROLLBACK.sql'),
    'utf8',
  );

  async function createR16SeedFixture() {
    const testProducts = await db.query(`
      insert into da_next.products (sku, name, category, price_cents, stock_units, active)
      values
        ('R16-TEST-ARROZ', 'Arroz teste R16', 'MERCEARIA BÁSICA', 8500, 30, true),
        ('R16-TEST-FEIJAO', 'Feijão teste R16', 'MERCEARIA BÁSICA', 1000, 30, false),
        ('R16-TEST-OLEO', 'Óleo teste R16', 'MERCEARIA BÁSICA', 1000, 30, false)
      returning id, sku
    `);
    const testTypes = [
      ['00000000-0000-4000-8000-000000000271', 'Arroz R16'],
      ['00000000-0000-4000-8000-000000000272', 'Feijão R16'],
      ['00000000-0000-4000-8000-000000000273', 'Óleo R16'],
    ];
    await db.query(
      `insert into da_next.product_types (id, name, sort_order, active)
       values ($1, $2, 1, true), ($3, $4, 2, true), ($5, $6, 3, true)`,
      testTypes.flat(),
    );
    await db.query(
      `insert into da_next.product_type_products (product_type_id, product_id)
       values
         ($1, (select id from da_next.products where sku = 'R16-TEST-ARROZ')),
         ($2, (select id from da_next.products where sku = 'R16-TEST-FEIJAO')),
         ($3, (select id from da_next.products where sku = 'R16-TEST-OLEO'))`,
      testTypes.map(([id]) => id),
    );
    await db.query(
      `insert into da_next.basket_sizes (id, code, name, active, sort_order)
       values ('r16-test', 'R16_TEST', 'Cesta de teste R16', true, 99)`,
    );
    await db.query(
      `insert into da_next.basket_size_types
         (basket_size_id, product_type_id, default_quantity, sort_order)
       values
         ('r16-test', $1, 1, 1),
         ('r16-test', $2, 1, 2),
         ('r16-test', $3, 1, 3)`,
      testTypes.map(([id]) => id),
    );
    await db.query(
      `insert into da_next.basket_size_private_pricing (basket_size_id, private_adjustment_cents)
       values ('r16-test', 0)`,
    );
    await db.query(
      `insert into da_next.basket_extra_types (product_type_id, sort_order, active)
       values ($1, 1, true)`,
      [testTypes[0][0]],
    );
    await db.query(
      `insert into da_next.bling_product_profiles (sku)
       values ('R16-TEST-ARROZ'), ('R16-TEST-FEIJAO'), ('R16-TEST-OLEO')`,
    );
    await db.query(
      `insert into da_next.product_stock_movements
         (product_id, delta_units, reason, idempotency_key)
       select id, 30, 'IMPORTACAO',
         case sku
           when 'R16-TEST-ARROZ' then 'r16-seed-arroz-v1'
           when 'R16-TEST-FEIJAO' then 'r16-seed-feijao-v1'
           else 'r16-seed-oleo-v1'
         end
       from da_next.products
       where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')`,
    );
    return testProducts.rows;
  }

  await createR16SeedFixture();
  await db.exec(r16RollbackSql);
  const deletedR16Seed = await db.query(`
    select
      (select count(*)::int from da_next.products
       where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')) as products,
      (select count(*)::int from da_next.product_types
       where id in (
         '00000000-0000-4000-8000-000000000271',
         '00000000-0000-4000-8000-000000000272',
         '00000000-0000-4000-8000-000000000273')) as types,
      (select count(*)::int from da_next.basket_sizes where id = 'r16-test') as baskets,
      (select count(*)::int from da_next.product_stock_movements
       where idempotency_key in ('r16-seed-arroz-v1', 'r16-seed-feijao-v1', 'r16-seed-oleo-v1')) as movements
  `);
  assert.deepEqual(
    deletedR16Seed.rows[0],
    { products: 0, types: 0, baskets: 0, movements: 0 },
    'rollback must remove the unused synthetic seed and its dependent extra-type link',
  );

  const r16Products = await createR16SeedFixture();
  const r16ProductId = r16Products.find((product) => product.sku === 'R16-TEST-ARROZ').id;
  const r16Order = await db.query(`
    insert into da_next.orders (
      order_number, customer_name_snapshot, customer_phone_snapshot, address_snapshot,
      payment_method, subtotal_cents, total_cents, request_idempotency_key, request_fingerprint
    ) values (
      'DA-2026-R16-ORDER', 'Operador teste R16', '65977776666',
      '{"city":"Cuiabá","state":"MT"}', 'PIX', 8500, 8500,
      'r16-rollback-order-001', 'r16-rollback-fingerprint'
    ) returning id
  `);
  const r16OrderId = r16Order.rows[0].id;
  const r16Snapshot = await db.query(
    `
    insert into da_next.order_basket_snapshots (
      order_id, line_number, basket_size_id, basket_code_snapshot, basket_name_snapshot,
      quantity, public_unit_price_cents, private_adjustment_cents, line_total_cents
    ) values ($1, 1, 'r16-test', 'R16_TEST', 'Cesta de teste R16', 1, 8500, 0, 8500)
    returning id
  `,
    [r16OrderId],
  );
  await db.query(
    `
    insert into da_next.order_basket_snapshot_types (
      order_basket_snapshot_id, product_type_id, type_name_snapshot, selected_quantity
    ) values ($1, '00000000-0000-4000-8000-000000000271', 'Arroz R16', 1)
  `,
    [r16Snapshot.rows[0].id],
  );
  await db.query(
    `
    insert into da_next.order_items (
      order_id, order_basket_snapshot_id, line_number, item_kind, product_id,
      product_type_id, sku_snapshot, product_name_snapshot, product_type_name_snapshot, quantity
    ) values (
      $1, $2, 1, 'BASKET_COMPONENT', $3, '00000000-0000-4000-8000-000000000271',
      'R16-TEST-ARROZ', 'Arroz teste R16', 'Arroz R16', 1
    )
  `,
    [r16OrderId, r16Snapshot.rows[0].id, r16ProductId],
  );
  await db.query(
    `
    insert into da_next.inventory_reservations (order_id, product_id, quantity, expires_at)
    values ($1, $2, 1, now() + interval '10 minutes')
  `,
    [r16OrderId, r16ProductId],
  );

  await db.exec(r16RollbackSql);
  const archivedR16Seed = await db.query(
    `
    select
      (select count(*)::int from da_next.products
       where sku in ('R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO')
         and not active) as inactive_products,
      (select count(*)::int from da_next.product_types
       where id in (
         '00000000-0000-4000-8000-000000000271',
         '00000000-0000-4000-8000-000000000272',
         '00000000-0000-4000-8000-000000000273')
         and not active) as inactive_types,
      (select count(*)::int from da_next.basket_sizes
       where id = 'r16-test' and not active) as inactive_basket,
      (select count(*)::int from da_next.product_stock_movements
       where idempotency_key in ('r16-seed-arroz-v1', 'r16-seed-feijao-v1', 'r16-seed-oleo-v1')) as preserved_movements,
      (select count(*)::int from da_next.order_items where order_id = $1) as preserved_order_items
  `,
    [r16OrderId],
  );
  assert.deepEqual(
    archivedR16Seed.rows[0],
    {
      inactive_products: 3,
      inactive_types: 3,
      inactive_basket: 1,
      preserved_movements: 3,
      preserved_order_items: 1,
    },
    'rollback must archive the seed and retain its product, basket, movement and order history after checkout',
  );
  await db.exec(r16RollbackSql);

  console.log(
    `PostgreSQL isolado: ${migrations.length} migrações, ${expectedTables.length} tabelas, RLS/RBAC positivo e negativo, privacidade e rollback verificados.`,
  );
} finally {
  await db.close();
}
