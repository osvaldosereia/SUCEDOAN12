-- R03: staff roles, least-privilege grants and row-level policies.
-- da_next remains outside the Supabase Data API exposed schemas.

-- Separate private basket pricing from rows that catalog operators need to read.
create table da_next.basket_size_private_pricing (
  basket_size_id text primary key references da_next.basket_sizes(id) on delete restrict,
  private_adjustment_cents integer not null default 0
    check (private_adjustment_cents between 0 and 2000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger basket_size_private_pricing_touch_updated_at
before update on da_next.basket_size_private_pricing
for each row execute function da_next.touch_updated_at();
insert into da_next.basket_size_private_pricing (basket_size_id, private_adjustment_cents)
select id, private_adjustment_cents from da_next.basket_sizes;
alter table da_next.basket_sizes drop column private_adjustment_cents;

create table da_next.order_basket_private_pricing (
  order_basket_snapshot_id uuid primary key
    references da_next.order_basket_snapshots(id) on delete restrict,
  private_adjustment_cents integer not null
    check (private_adjustment_cents between 0 and 2000000000),
  created_at timestamptz not null default now()
);
insert into da_next.order_basket_private_pricing (
  order_basket_snapshot_id, private_adjustment_cents
)
select id, private_adjustment_cents from da_next.order_basket_snapshots;
alter table da_next.order_basket_snapshots drop column private_adjustment_cents;

create type da_next.staff_role as enum ('ADMIN', 'PRODUCTS', 'SEPARATION', 'SUPPORT');
create table da_next.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  role da_next.staff_role not null,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index staff_role_assignments_one_active_role
  on da_next.staff_role_assignments (user_id)
  where revoked_at is null;
create index staff_role_assignments_user_history
  on da_next.staff_role_assignments (user_id, created_at desc);

comment on table da_next.staff_role_assignments is
  'One active staff role per Auth user. Role assignment is server/admin controlled; no public signup path.';
comment on table da_next.basket_size_private_pricing is
  'Private basket adjustment; kept outside catalog rows readable by product operators.';
comment on table da_next.order_basket_private_pricing is
  'Private price component snapshot; operational order views expose only the aggregate total.';

create or replace function da_next.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from da_next.staff_role_assignments as assignment
    where assignment.user_id = auth.uid()
      and assignment.revoked_at is null
      and case required_permission
        when 'admin.all' then assignment.role = 'ADMIN'::da_next.staff_role
        when 'users.manage' then assignment.role = 'ADMIN'::da_next.staff_role
        when 'catalog.read' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'PRODUCTS'::da_next.staff_role
        )
        when 'catalog.manage' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'PRODUCTS'::da_next.staff_role
        )
        when 'inventory.read' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'PRODUCTS'::da_next.staff_role,
          'SEPARATION'::da_next.staff_role
        )
        when 'orders.read' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'SEPARATION'::da_next.staff_role,
          'SUPPORT'::da_next.staff_role
        )
        when 'orders.separate' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'SEPARATION'::da_next.staff_role
        )
        when 'customers.read' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'SEPARATION'::da_next.staff_role,
          'SUPPORT'::da_next.staff_role
        )
        when 'conversations.read' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'SUPPORT'::da_next.staff_role
        )
        when 'conversations.manage' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'SUPPORT'::da_next.staff_role
        )
        when 'private.read' then assignment.role = 'ADMIN'::da_next.staff_role
        when 'private.manage' then assignment.role = 'ADMIN'::da_next.staff_role
        when 'audit.read' then assignment.role = 'ADMIN'::da_next.staff_role
        when 'audit.write' then assignment.role in (
          'ADMIN'::da_next.staff_role, 'PRODUCTS'::da_next.staff_role,
          'SEPARATION'::da_next.staff_role, 'SUPPORT'::da_next.staff_role
        )
        else false
      end
  );
$function$;

revoke all on function da_next.has_permission(text) from public, anon, authenticated;
grant execute on function da_next.has_permission(text) to authenticated, service_role;

-- RLS stays enabled for every table; all authenticated access is explicit below.
alter table da_next.basket_size_private_pricing enable row level security;
alter table da_next.order_basket_private_pricing enable row level security;
alter table da_next.staff_role_assignments enable row level security;

-- No anon grants or policies. Authenticated users receive schema access only;
-- da_next must still remain absent from the Data API exposed-schema setting.
revoke all on schema da_next from public, anon, authenticated;
grant usage on schema da_next to authenticated;
revoke all on all tables in schema da_next from public, anon, authenticated;
grant select on all tables in schema da_next to authenticated;

-- Catalog operators can edit commercial fields but cannot write stock directly.
grant insert (sku, name, brand, category, gtin, price_cents, active, photo_url, valid_until)
  on da_next.products to authenticated;
grant update (name, brand, category, gtin, price_cents, active, photo_url, valid_until)
  on da_next.products to authenticated;
grant insert (name, sort_order, active) on da_next.product_types to authenticated;
grant update (name, sort_order, active) on da_next.product_types to authenticated;
grant insert (product_type_id, product_id, sort_order)
  on da_next.product_type_products to authenticated;
grant update (sort_order) on da_next.product_type_products to authenticated;
grant delete on da_next.product_type_products to authenticated;
grant insert (id, code, name, active, sort_order) on da_next.basket_sizes to authenticated;
grant update (name, active, sort_order) on da_next.basket_sizes to authenticated;
grant insert (basket_size_id, product_type_id, default_quantity, sort_order)
  on da_next.basket_size_types to authenticated;
grant update (default_quantity, sort_order) on da_next.basket_size_types to authenticated;
grant delete on da_next.basket_size_types to authenticated;

-- Private values remain in separate tables and have admin-only row policies.
grant insert (basket_size_id, private_adjustment_cents)
  on da_next.basket_size_private_pricing to authenticated;
grant update (private_adjustment_cents)
  on da_next.basket_size_private_pricing to authenticated;

-- Separation commands and support message sends stay server-only until their
-- transactional application services are implemented in later rounds.
grant insert (user_id, role, created_by)
  on da_next.staff_role_assignments to authenticated;
grant update (revoked_at, revoked_by)
  on da_next.staff_role_assignments to authenticated;
grant insert (actor_id, action, entity_type, entity_id, request_id, changed_fields)
  on da_next.audit_log to authenticated;

-- Admin can manage business tables through explicit policies, while ledger,
-- checkout, message, fiscal-document and outbox writes remain service-side.
do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'product_types', 'product_type_products', 'basket_sizes',
    'basket_size_types', 'basket_size_private_pricing', 'order_basket_private_pricing',
    'customers', 'customer_addresses', 'orders', 'order_basket_snapshots',
    'order_basket_snapshot_types', 'order_items', 'inventory_reservations',
    'order_commands', 'bling_product_profiles', 'product_stock_movements',
    'order_events', 'integration_outbox', 'audit_log', 'conversations',
    'conversation_messages', 'fiscal_documents'
  ] loop
    execute format(
      'create policy admin_all on da_next.%I for all to authenticated using (da_next.has_permission(''admin.all'')) with check (da_next.has_permission(''admin.all''))',
      table_name
    );
  end loop;
end;
$policies$;

create policy role_assignments_read on da_next.staff_role_assignments
  for select to authenticated
  using (user_id = auth.uid() or da_next.has_permission('users.manage'));
create policy role_assignments_insert on da_next.staff_role_assignments
  for insert to authenticated
  with check (da_next.has_permission('users.manage') and created_by = auth.uid());
create policy role_assignments_revoke on da_next.staff_role_assignments
  for update to authenticated
  using (da_next.has_permission('users.manage') and revoked_at is null)
  with check (
    da_next.has_permission('users.manage')
    and revoked_at is not null
    and revoked_by = auth.uid()
  );

create policy products_catalog_read on da_next.products
  for select to authenticated using (da_next.has_permission('catalog.read'));
create policy products_catalog_insert on da_next.products
  for insert to authenticated with check (da_next.has_permission('catalog.manage'));
create policy products_catalog_update on da_next.products
  for update to authenticated
  using (da_next.has_permission('catalog.manage'))
  with check (da_next.has_permission('catalog.manage'));

create policy product_types_catalog_read on da_next.product_types
  for select to authenticated using (da_next.has_permission('catalog.read'));
create policy product_types_catalog_insert on da_next.product_types
  for insert to authenticated with check (da_next.has_permission('catalog.manage'));
create policy product_types_catalog_update on da_next.product_types
  for update to authenticated
  using (da_next.has_permission('catalog.manage'))
  with check (da_next.has_permission('catalog.manage'));

create policy type_products_catalog_read on da_next.product_type_products
  for select to authenticated using (da_next.has_permission('catalog.read'));
create policy type_products_catalog_insert on da_next.product_type_products
  for insert to authenticated with check (da_next.has_permission('catalog.manage'));
create policy type_products_catalog_update on da_next.product_type_products
  for update to authenticated
  using (da_next.has_permission('catalog.manage'))
  with check (da_next.has_permission('catalog.manage'));
create policy type_products_catalog_delete on da_next.product_type_products
  for delete to authenticated using (da_next.has_permission('catalog.manage'));

create policy basket_sizes_catalog_read on da_next.basket_sizes
  for select to authenticated using (da_next.has_permission('catalog.read'));
create policy basket_sizes_catalog_insert on da_next.basket_sizes
  for insert to authenticated with check (da_next.has_permission('catalog.manage'));
create policy basket_sizes_catalog_update on da_next.basket_sizes
  for update to authenticated
  using (da_next.has_permission('catalog.manage'))
  with check (da_next.has_permission('catalog.manage'));

create policy basket_types_catalog_read on da_next.basket_size_types
  for select to authenticated using (da_next.has_permission('catalog.read'));
create policy basket_types_catalog_insert on da_next.basket_size_types
  for insert to authenticated with check (da_next.has_permission('catalog.manage'));
create policy basket_types_catalog_update on da_next.basket_size_types
  for update to authenticated
  using (da_next.has_permission('catalog.manage'))
  with check (da_next.has_permission('catalog.manage'));
create policy basket_types_catalog_delete on da_next.basket_size_types
  for delete to authenticated using (da_next.has_permission('catalog.manage'));

create policy basket_private_read on da_next.basket_size_private_pricing
  for select to authenticated using (da_next.has_permission('private.read'));
create policy basket_private_insert on da_next.basket_size_private_pricing
  for insert to authenticated with check (da_next.has_permission('private.manage'));
create policy basket_private_update on da_next.basket_size_private_pricing
  for update to authenticated
  using (da_next.has_permission('private.manage'))
  with check (da_next.has_permission('private.manage'));
create policy order_basket_private_read on da_next.order_basket_private_pricing
  for select to authenticated using (da_next.has_permission('private.read'));

create policy customers_operational_read on da_next.customers
  for select to authenticated using (da_next.has_permission('customers.read'));
create policy addresses_operational_read on da_next.customer_addresses
  for select to authenticated using (da_next.has_permission('customers.read'));
create policy orders_operational_read on da_next.orders
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy basket_snapshots_operational_read on da_next.order_basket_snapshots
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy basket_snapshot_types_operational_read on da_next.order_basket_snapshot_types
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy order_items_operational_read on da_next.order_items
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy reservations_operational_read on da_next.inventory_reservations
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy order_commands_operational_read on da_next.order_commands
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy order_events_operational_read on da_next.order_events
  for select to authenticated using (da_next.has_permission('orders.read'));
create policy stock_operational_read on da_next.product_stock_movements
  for select to authenticated using (da_next.has_permission('inventory.read'));

create policy fiscal_profiles_private_read on da_next.bling_product_profiles
  for select to authenticated using (da_next.has_permission('private.read'));
create policy fiscal_documents_private_read on da_next.fiscal_documents
  for select to authenticated using (da_next.has_permission('private.read'));
create policy outbox_private_read on da_next.integration_outbox
  for select to authenticated using (da_next.has_permission('private.read'));
create policy audit_admin_read on da_next.audit_log
  for select to authenticated using (da_next.has_permission('audit.read'));
create policy audit_append_own on da_next.audit_log
  for insert to authenticated
  with check (da_next.has_permission('audit.write') and actor_id = auth.uid());

create policy conversations_support_read on da_next.conversations
  for select to authenticated using (da_next.has_permission('conversations.read'));
create policy messages_support_read on da_next.conversation_messages
  for select to authenticated using (da_next.has_permission('conversations.read'));
