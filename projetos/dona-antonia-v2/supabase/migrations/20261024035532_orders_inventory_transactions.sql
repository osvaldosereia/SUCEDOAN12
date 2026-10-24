-- R02: customer snapshots, orders, basket composition snapshots and inventory holds.
create table da_next.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (display_name = btrim(display_name) and length(display_name) > 0),
  phone_digits text not null check (phone_digits ~ '^[0-9]{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_phone_digits on da_next.customers (phone_digits);
create trigger customers_touch_updated_at
before update on da_next.customers
for each row execute function da_next.touch_updated_at();

create table da_next.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references da_next.customers(id) on delete restrict,
  label text not null default 'Principal',
  recipient_name text not null check (recipient_name = btrim(recipient_name) and length(recipient_name) > 0),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  street text not null check (street = btrim(street) and length(street) > 0),
  street_number text not null check (street_number = btrim(street_number) and length(street_number) > 0),
  complement text,
  neighborhood text not null check (neighborhood = btrim(neighborhood) and length(neighborhood) > 0),
  city text not null check (city = btrim(city) and length(city) > 0),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  reference_note text,
  is_default boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_customer on da_next.customer_addresses (customer_id, is_default desc, created_at);
create trigger customer_addresses_touch_updated_at
before update on da_next.customer_addresses
for each row execute function da_next.touch_updated_at();

create table da_next.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number = btrim(order_number) and length(order_number) > 0),
  customer_id uuid references da_next.customers(id) on delete set null,
  customer_name_snapshot text not null check (customer_name_snapshot = btrim(customer_name_snapshot) and length(customer_name_snapshot) > 0),
  customer_phone_snapshot text not null check (customer_phone_snapshot ~ '^[0-9]{10,11}$'),
  address_snapshot jsonb not null check (jsonb_typeof(address_snapshot) = 'object'),
  payment_method text not null check (payment_method in (
    'PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO',
    'VALE_ALIMENTACAO', 'VALE_REFEICAO'
  )),
  status text not null default 'NOVO' check (status in ('NOVO', 'EM_SEPARACAO', 'PRONTO', 'ENTREGUE')),
  payment_status text not null default 'PENDENTE' check (payment_status in ('PENDENTE', 'RECEBIDO', 'CANCELADO')),
  delivery_status text not null default 'AGUARDANDO' check (delivery_status in ('AGUARDANDO', 'CONCLUIDA', 'PROBLEMA')),
  fiscal_status text not null default 'PENDENTE' check (fiscal_status in ('PENDENTE', 'EMITINDO', 'EMITIDA', 'ERRO', 'CANCELADA')),
  subtotal_cents numeric(12, 0) not null check (subtotal_cents between 0 and 999999999999),
  delivery_cents numeric(12, 0) not null default 0 check (delivery_cents between 0 and 999999999999),
  total_cents numeric(12, 0) not null check (total_cents between 0 and 999999999999),
  request_idempotency_key text not null unique check (length(btrim(request_idempotency_key)) > 0),
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  version integer not null default 1 check (version > 0),
  assigned_to uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cancelled_at is null) = (cancellation_reason is null))
);
create index orders_status_created on da_next.orders (status, created_at desc, id);
create index orders_customer_created on da_next.orders (customer_id, created_at desc);
create index orders_phone_created on da_next.orders (customer_phone_snapshot, created_at desc);
create trigger orders_touch_updated_at
before update on da_next.orders
for each row execute function da_next.touch_updated_at();

create table da_next.order_basket_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  basket_size_id text not null references da_next.basket_sizes(id) on delete restrict,
  basket_code_snapshot text not null,
  basket_name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 999),
  public_unit_price_cents numeric(12, 0) not null check (public_unit_price_cents between 0 and 999999999999),
  private_adjustment_cents integer not null check (private_adjustment_cents between 0 and 2000000000),
  line_total_cents numeric(12, 0) not null check (line_total_cents between 0 and 999999999999),
  created_at timestamptz not null default now(),
  unique (order_id, line_number),
  unique (id, order_id),
  check (private_adjustment_cents <= public_unit_price_cents),
  check (line_total_cents = public_unit_price_cents * quantity)
);
create index order_basket_snapshots_order on da_next.order_basket_snapshots (order_id, line_number);

create table da_next.order_basket_snapshot_types (
  order_basket_snapshot_id uuid not null references da_next.order_basket_snapshots(id) on delete restrict,
  product_type_id uuid not null references da_next.product_types(id) on delete restrict,
  type_name_snapshot text not null check (length(btrim(type_name_snapshot)) > 0),
  selected_quantity integer not null check (selected_quantity between 0 and 999),
  created_at timestamptz not null default now(),
  primary key (order_basket_snapshot_id, product_type_id)
);

create table da_next.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  order_basket_snapshot_id uuid,
  line_number integer not null check (line_number > 0),
  item_kind text not null check (item_kind in ('BASKET_COMPONENT', 'EXTRA')),
  product_id uuid not null references da_next.products(id) on delete restrict,
  product_type_id uuid not null references da_next.product_types(id) on delete restrict,
  sku_snapshot text not null check (length(btrim(sku_snapshot)) > 0),
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) > 0),
  product_type_name_snapshot text not null check (length(btrim(product_type_name_snapshot)) > 0),
  quantity integer not null check (quantity between 1 and 999),
  fulfilled_quantity integer not null default 0 check (fulfilled_quantity between 0 and quantity),
  separation_status text not null default 'PENDENTE' check (separation_status in ('PENDENTE', 'SEPARADO', 'FALTOU')),
  unit_price_cents numeric(12, 0),
  line_total_cents numeric(12, 0),
  created_at timestamptz not null default now(),
  unique (order_id, line_number),
  foreign key (order_basket_snapshot_id, order_id)
    references da_next.order_basket_snapshots(id, order_id) on delete restrict,
  foreign key (order_basket_snapshot_id, product_type_id)
    references da_next.order_basket_snapshot_types(order_basket_snapshot_id, product_type_id) on delete restrict,
  foreign key (product_type_id, product_id)
    references da_next.product_type_products(product_type_id, product_id) on delete restrict,
  check (
    (item_kind = 'BASKET_COMPONENT'
      and order_basket_snapshot_id is not null
      and unit_price_cents is null
      and line_total_cents is null)
    or
    (item_kind = 'EXTRA'
      and order_basket_snapshot_id is null
      and unit_price_cents is not null
      and line_total_cents is not null
      and unit_price_cents between 0 and 999999999999
      and line_total_cents = unit_price_cents * quantity)
  ),
  check (
    (separation_status = 'PENDENTE' and fulfilled_quantity = 0)
    or (separation_status = 'SEPARADO' and fulfilled_quantity = quantity)
    or (separation_status = 'FALTOU' and fulfilled_quantity = 0)
  )
);
create index order_items_order_line on da_next.order_items (order_id, line_number);
create index order_items_product on da_next.order_items (product_id, order_id);

create table da_next.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  product_id uuid not null references da_next.products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999999),
  status text not null default 'RESERVADA' check (status in ('RESERVADA', 'CONSUMIDA', 'LIBERADA', 'EXPIRADA')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (order_id, product_id),
  check ((status = 'RESERVADA' and resolved_at is null) or (status <> 'RESERVADA' and resolved_at is not null))
);
create index inventory_reservations_active_product
  on da_next.inventory_reservations (product_id, expires_at)
  where status = 'RESERVADA';
create index inventory_reservations_order on da_next.inventory_reservations (order_id, status);

create table da_next.order_commands (
  order_id uuid not null references da_next.orders(id) on delete restrict,
  command_id text not null check (length(btrim(command_id)) > 0),
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  command_type text not null check (command_type in ('START', 'MARK', 'FINISH', 'DELIVER', 'CANCEL')),
  actor_id uuid,
  expected_version integer not null check (expected_version > 0),
  result_version integer not null check (result_version > expected_version),
  created_at timestamptz not null default now(),
  primary key (order_id, command_id)
);
create index order_commands_actor_created on da_next.order_commands (actor_id, created_at desc);

comment on table da_next.order_basket_snapshots is
  'Preço agregado da cesta e componente privado permanecem no backend; a vitrine recebe apenas o total público.';
comment on column da_next.orders.address_snapshot is
  'Objeto imutável no pedido confirmado; endereço vivo do cliente pode mudar sem alterar histórico.';
comment on table da_next.inventory_reservations is
  'Reserva deve ser criada/liberada/consumida na mesma transação do pedido; tabela sozinha não previne overselling.';
comment on table da_next.order_commands is
  'Recibo idempotente por comando; o adapter compara versão e fingerprint dentro da transação.';
