-- R02: private fiscal data, inbox persistence contracts, audit and transactional outbox.
create table da_next.bling_product_profiles (
  sku text primary key references da_next.products(sku) on update cascade on delete restrict,
  bling_product_id text unique,
  unit text not null default 'UN' check (unit = 'UN'),
  origin_code text check (origin_code is null or origin_code ~ '^[0-9]{1,2}$'),
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  packaging_gtin text check (
    packaging_gtin is null or packaging_gtin ~ '^(?:[0-9]{8}|[0-9]{12,14})$'
  ),
  units_per_case integer check (units_per_case is null or units_per_case > 0),
  supplier_name text,
  supplier_code text,
  purchase_cost_cents integer not null default 0 check (purchase_cost_cents >= 0),
  original_import_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(original_import_fields) = 'object'),
  synced_at timestamptz,
  sync_error text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bling_product_profiles_touch_updated_at
before update on da_next.bling_product_profiles
for each row execute function da_next.touch_updated_at();
comment on table da_next.bling_product_profiles is
  'Dados fiscais, custo, fornecedor e importação original são privados; nunca entram na projeção pública.';

create table da_next.product_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references da_next.products(id) on delete restrict,
  delta_units integer not null check (delta_units <> 0),
  reason text not null check (reason in ('IMPORTACAO', 'AJUSTE_MANUAL', 'VENDA', 'DEVOLUCAO', 'CORRECAO')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  reference_order_id uuid references da_next.orders(id) on delete restrict,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now(),
  check ((reason = 'VENDA' and reference_order_id is not null) or reason <> 'VENDA')
);
create index product_stock_movements_product_created
  on da_next.product_stock_movements (product_id, created_at desc);

create table da_next.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  version integer not null check (version > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  actor_id uuid,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  unique (order_id, version, event_type)
);
create index order_events_timeline on da_next.order_events (order_id, created_at, id);

create table da_next.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null check (aggregate_type in ('ORDER', 'PRODUCT', 'CONVERSATION', 'FISCAL_DOCUMENT')),
  aggregate_id uuid not null,
  aggregate_version integer not null check (aggregate_version > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO_FINAL')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_token uuid,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'PROCESSANDO' and locked_until is not null and lock_token is not null)
    or status <> 'PROCESSANDO'),
  check ((status = 'CONCLUIDO') = (completed_at is not null))
);
create index integration_outbox_due
  on da_next.integration_outbox (available_at, created_at)
  where status = 'PENDENTE';
create index integration_outbox_lease
  on da_next.integration_outbox (locked_until)
  where status = 'PROCESSANDO';
create unique index integration_outbox_aggregate_event_unique
  on da_next.integration_outbox (aggregate_type, aggregate_id, aggregate_version, event_type);
comment on table da_next.integration_outbox is
  'Eventos gravados na mesma transação de domínio; nenhum worker ou envio é ativado por estas migrações.';

create table da_next.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null check (length(btrim(action)) > 0),
  entity_type text not null check (length(btrim(entity_type)) > 0),
  entity_id text not null check (length(btrim(entity_id)) > 0),
  request_id uuid,
  changed_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(changed_fields) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_log_entity_timeline
  on da_next.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_timeline
  on da_next.audit_log (actor_id, created_at desc);
comment on table da_next.audit_log is
  'Trilha append-only sem payload bruto de cliente, endereço, mensagem ou segredo; R03 definirá escrita autorizada.';

create table da_next.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references da_next.customers(id) on delete set null,
  order_id uuid references da_next.orders(id) on delete set null,
  provider text not null default 'WHATSAPP' check (provider = 'WHATSAPP'),
  provider_account text not null check (provider_account in ('0975', '1018')),
  external_contact_id text not null check (length(btrim(external_contact_id)) > 0),
  customer_phone_snapshot text not null check (customer_phone_snapshot ~ '^[0-9]{10,11}$'),
  status text not null default 'ABERTA' check (status in ('ABERTA', 'PENDENTE', 'CONCLUIDA')),
  assigned_to uuid,
  version integer not null default 1 check (version > 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account, external_contact_id)
);
create index conversations_status_recent on da_next.conversations (status, last_message_at desc nulls last);
create index conversations_customer_recent on da_next.conversations (customer_id, last_message_at desc nulls last);
create trigger conversations_touch_updated_at
before update on da_next.conversations
for each row execute function da_next.touch_updated_at();

create table da_next.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references da_next.conversations(id) on delete restrict,
  provider_account text not null check (provider_account in ('0975', '1018')),
  provider_message_id text,
  direction text not null check (direction in ('ENTRADA', 'SAIDA')),
  content_text text,
  media_metadata jsonb not null default '[]'::jsonb check (jsonb_typeof(media_metadata) = 'array'),
  delivery_status text not null check (delivery_status in ('RECEBIDA', 'NA_FILA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (content_text is not null or jsonb_array_length(media_metadata) > 0)
);
create unique index conversation_messages_provider_id_unique
  on da_next.conversation_messages (provider_account, provider_message_id)
  where provider_message_id is not null;
create index conversation_messages_timeline
  on da_next.conversation_messages (conversation_id, occurred_at, id);

create table da_next.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  provider text not null default 'BLING' check (provider = 'BLING'),
  provider_document_id text unique,
  access_key text unique check (access_key is null or access_key ~ '^[0-9]{44}$'),
  document_number text,
  series text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ENVIANDO', 'EMITIDA', 'ERRO', 'CANCELADA')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  error_code text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'EMITIDA' and issued_at is not null) or status <> 'EMITIDA')
);
create unique index fiscal_documents_one_live_per_order
  on da_next.fiscal_documents (order_id)
  where status in ('PENDENTE', 'ENVIANDO', 'EMITIDA');
create index fiscal_documents_status_created
  on da_next.fiscal_documents (status, created_at);
create trigger fiscal_documents_touch_updated_at
before update on da_next.fiscal_documents
for each row execute function da_next.touch_updated_at();
comment on table da_next.fiscal_documents is
  'Registro planejado de NF-e; esta migração não chama o Bling nem transmite documentos.';
