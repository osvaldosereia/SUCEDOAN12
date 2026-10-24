-- R13: isolated fiscal orchestration for Bling homologation.
-- No OAuth, token, HTTP call or provider worker is enabled here.

alter table da_next.fiscal_documents
  add column attempts integer not null default 0 check (attempts >= 0),
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  add column next_attempt_at timestamptz,
  add column last_attempt_at timestamptz,
  add column error_detail text,
  add column request_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_context) = 'object');

create table da_next.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  fiscal_document_id uuid not null references da_next.fiscal_documents(id) on delete restrict,
  order_item_id uuid not null references da_next.order_items(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  item_kind text not null check (item_kind in ('BASKET_COMPONENT', 'EXTRA')),
  sku_snapshot text not null check (length(btrim(sku_snapshot)) > 0),
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) > 0),
  quantity integer not null check (quantity between 1 and 999),
  line_total_cents numeric(12, 0),
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  origin_code text check (origin_code is null or origin_code ~ '^[0-9]{1,2}$'),
  cfop text not null check (cfop ~ '^[0-9]{4}$'),
  tax_situation_code text not null check (tax_situation_code ~ '^[0-9]{3}$'),
  tax_regime text not null check (tax_regime in ('NORMAL', 'SIMPLES_NACIONAL')),
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, line_number),
  unique (fiscal_document_id, order_item_id)
);
create index fiscal_document_items_document on da_next.fiscal_document_items (fiscal_document_id, line_number);

create table da_next.fiscal_document_events (
  id uuid primary key default gen_random_uuid(),
  fiscal_document_id uuid not null references da_next.fiscal_documents(id) on delete restrict,
  attempt integer not null check (attempt >= 0),
  event_type text not null check (event_type in ('SOLICITACAO', 'RESULTADO')),
  status text not null check (status in ('PENDENTE', 'EMITINDO', 'EMITIDA', 'ERRO')),
  provider_document_id text,
  error_code text,
  error_detail text,
  response_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(response_summary) = 'object'),
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, attempt, event_type)
);
create index fiscal_document_events_timeline
  on da_next.fiscal_document_events (fiscal_document_id, created_at desc);

alter table da_next.fiscal_document_items enable row level security;
alter table da_next.fiscal_document_events enable row level security;
create policy fiscal_document_items_admin_all on da_next.fiscal_document_items
  for all to authenticated
  using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy fiscal_document_events_admin_all on da_next.fiscal_document_events
  for all to authenticated
  using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
grant select on da_next.fiscal_documents, da_next.fiscal_document_items, da_next.fiscal_document_events
  to authenticated;

create or replace function da_next.fiscal_document_projection(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', document.id,
    'order_id', document.order_id,
    'provider', document.provider,
    'provider_document_id', document.provider_document_id,
    'access_key', document.access_key,
    'document_number', document.document_number,
    'series', document.series,
    'status', document.status,
    'idempotency_key', document.idempotency_key,
    'attempts', document.attempts,
    'max_attempts', document.max_attempts,
    'next_attempt_at', document.next_attempt_at,
    'last_attempt_at', document.last_attempt_at,
    'error_code', document.error_code,
    'error_detail', document.error_detail,
    'request_context', document.request_context,
    'item_count', (select count(*) from da_next.fiscal_document_items item where item.fiscal_document_id = document.id),
    'created_at', document.created_at,
    'updated_at', document.updated_at
  )
  from da_next.fiscal_documents document
  where document.id = p_document_id;
$function$;

create or replace function public.admin_request_fiscal_document(
  p_order_id uuid,
  p_request_id uuid,
  p_fiscal_context jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_order da_next.orders;
  v_document da_next.fiscal_documents;
  v_context jsonb := coalesce(p_fiscal_context, '{}'::jsonb);
  v_destination_uf text;
  v_cfop text;
  v_tax_situation_code text;
  v_tax_regime text;
  v_missing_ncm integer;
  v_missing_fiscal_profile integer;
  v_attempt integer;
  v_idempotency_key text;
  v_error_code text;
  v_error_detail text;
begin
  if auth.uid() is null or not da_next.has_permission('admin.all') then
    raise exception using errcode = '42501', message = 'Apenas administradores podem solicitar emissão fiscal.';
  end if;
  if p_order_id is null or p_request_id is null or jsonb_typeof(v_context) <> 'object' then
    raise exception using errcode = '22023', message = 'Pedido e contexto fiscal são obrigatórios.';
  end if;
  v_destination_uf := upper(nullif(btrim(v_context->>'destination_uf'), ''));
  v_cfop := nullif(btrim(v_context->>'cfop'), '');
  v_tax_situation_code := nullif(btrim(v_context->>'tax_situation_code'), '');
  v_tax_regime := upper(nullif(btrim(v_context->>'tax_regime'), ''));
  if v_destination_uf is null or v_destination_uf !~ '^[A-Z]{2}$'
    or v_cfop is null or v_cfop !~ '^[0-9]{4}$'
    or v_tax_situation_code is null or v_tax_situation_code !~ '^[0-9]{3}$'
    or v_tax_regime not in ('NORMAL', 'SIMPLES_NACIONAL') then
    raise exception using errcode = '22023', message = 'Contexto fiscal inválido: UF, CFOP, CST/CSOSN e regime são obrigatórios.';
  end if;

  select * into v_order from da_next.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Pedido não encontrado.'; end if;
  if v_order.status not in ('PRONTO', 'ENTREGUE') then
    raise exception using errcode = '22023', message = 'A emissão fiscal só pode ser solicitada após a separação.';
  end if;

  select * into v_document
  from da_next.fiscal_documents
  where order_id = p_order_id
  order by created_at desc, id desc
  limit 1
  for update;
  if found and v_document.status = 'EMITIDA' then
    return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', true);
  end if;
  if found and v_document.status in ('PENDENTE', 'ENVIANDO') then
    return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', true);
  end if;
  if found and v_document.attempts >= v_document.max_attempts then
    raise exception using errcode = '22023', message = 'Limite de tentativas fiscais atingido.';
  end if;

  if not found then
    v_idempotency_key := 'fiscal-document:' || p_order_id;
    insert into da_next.fiscal_documents (order_id, idempotency_key, request_context)
    values (p_order_id, v_idempotency_key, v_context)
    returning * into v_document;
  else
    update da_next.fiscal_documents
       set status = 'PENDENTE',
           request_context = v_context,
           error_code = null,
           error_detail = null,
           next_attempt_at = now(),
           updated_at = now()
     where id = v_document.id
     returning * into v_document;
  end if;

  select count(*) filter (where profile.sku is null)::integer,
         count(*) filter (where profile.ncm is null or profile.ncm !~ '^[0-9]{8}$')::integer
    into v_missing_fiscal_profile, v_missing_ncm
  from da_next.order_items item
  left join da_next.products product on product.id = item.product_id
  left join da_next.bling_product_profiles profile on profile.sku = product.sku
  where item.order_id = p_order_id;
  if v_missing_fiscal_profile > 0 then
    v_error_code := 'FISCAL_PROFILE_MISSING';
    v_error_detail := 'Há item do pedido sem perfil fiscal Bling vinculado ao SKU.';
  elsif v_missing_ncm > 0 then
    v_error_code := 'NCM_MISSING';
    v_error_detail := 'Há item do pedido sem NCM válido para emissão.';
  end if;
  if v_error_code is not null then
    update da_next.fiscal_documents
       set status = 'ERRO', error_code = v_error_code, error_detail = v_error_detail,
           next_attempt_at = null, updated_at = now()
     where id = v_document.id
     returning * into v_document;
    update da_next.orders set fiscal_status = 'ERRO' where id = p_order_id;
    insert into da_next.fiscal_document_events
      (fiscal_document_id, attempt, event_type, status, error_code, error_detail, response_summary)
    values
      (v_document.id, v_document.attempts, 'RESULTADO', 'ERRO', v_error_code, v_error_detail, '{}'::jsonb)
    on conflict (fiscal_document_id, attempt, event_type) do update
      set error_code = excluded.error_code, error_detail = excluded.error_detail;
    return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', false);
  end if;

  delete from da_next.fiscal_document_items where fiscal_document_id = v_document.id;
  insert into da_next.fiscal_document_items (
    fiscal_document_id, order_item_id, line_number, item_kind, sku_snapshot,
    product_name_snapshot, quantity, line_total_cents, ncm, cest, origin_code,
    cfop, tax_situation_code, tax_regime
  )
  select v_document.id, item.id, item.line_number, item.item_kind, item.sku_snapshot,
    item.product_name_snapshot, item.quantity, item.line_total_cents,
    profile.ncm, profile.cest, profile.origin_code, v_cfop, v_tax_situation_code, v_tax_regime
  from da_next.order_items item
  join da_next.products product on product.id = item.product_id
  join da_next.bling_product_profiles profile on profile.sku = product.sku
  where item.order_id = p_order_id;

  v_attempt := v_document.attempts + 1;
  insert into da_next.fiscal_document_events
    (fiscal_document_id, attempt, event_type, status, response_summary)
  values
    (v_document.id, v_attempt, 'SOLICITACAO', 'PENDENTE', jsonb_build_object(
      'destination_uf', v_destination_uf, 'cfop', v_cfop,
      'tax_situation_code', v_tax_situation_code, 'tax_regime', v_tax_regime
    ));
  update da_next.fiscal_documents
     set status = 'PENDENTE', request_context = jsonb_build_object(
           'destination_uf', v_destination_uf, 'cfop', v_cfop,
           'tax_situation_code', v_tax_situation_code, 'tax_regime', v_tax_regime
         ),
         next_attempt_at = now(), error_code = null, error_detail = null, updated_at = now()
   where id = v_document.id
   returning * into v_document;
  insert into da_next.integration_outbox
    (aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key, payload)
  values
    ('FISCAL_DOCUMENT', v_document.id, v_order.version + v_attempt - 1, 'BlingFiscalRequested',
     'fiscal-document:' || v_document.id || ':attempt:' || v_attempt,
     jsonb_build_object('fiscalDocumentId', v_document.id, 'orderId', p_order_id, 'attempt', v_attempt))
  on conflict (idempotency_key) do nothing;
  update da_next.orders set fiscal_status = 'EMITINDO' where id = p_order_id;
  return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', false);
end;
$function$;

create or replace function public.admin_record_fiscal_result(
  p_document_id uuid,
  p_status text,
  p_provider_document_id text,
  p_document_number text,
  p_series text,
  p_access_key text,
  p_error_code text,
  p_error_detail text,
  p_response_summary jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_document da_next.fiscal_documents;
  v_order_id uuid;
  v_attempt integer;
begin
  if auth.uid() is null or not da_next.has_permission('admin.all') then
    raise exception using errcode = '42501', message = 'Apenas administradores podem reconciliar resultado fiscal.';
  end if;
  if p_status not in ('EMITIDA', 'ERRO') then
    raise exception using errcode = '22023', message = 'Resultado fiscal inválido.';
  end if;
  select * into v_document from da_next.fiscal_documents where id = p_document_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Documento fiscal não encontrado.'; end if;
  if v_document.status = 'EMITIDA' then
    return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', true);
  end if;
  v_attempt := greatest(1, v_document.attempts);
  if p_status = 'EMITIDA' then
    if nullif(btrim(coalesce(p_provider_document_id, '')), '') is null
      or nullif(btrim(coalesce(p_document_number, '')), '') is null
      or p_access_key is null or p_access_key !~ '^[0-9]{44}$' then
      raise exception using errcode = '22023', message = 'Resultado emitido sem identificadores fiscais completos.';
    end if;
    update da_next.fiscal_documents
       set status = 'EMITIDA', provider_document_id = p_provider_document_id,
           document_number = p_document_number, series = nullif(btrim(p_series), ''),
           access_key = p_access_key, issued_at = coalesce(issued_at, now()),
           attempts = greatest(1, attempts), next_attempt_at = null,
           error_code = null, error_detail = null, last_attempt_at = now(), updated_at = now()
     where id = p_document_id
     returning * into v_document;
    update da_next.orders set fiscal_status = 'EMITIDA' where id = v_document.order_id;
  else
    v_attempt := v_document.attempts + 1;
    update da_next.fiscal_documents
       set status = 'ERRO', attempts = v_attempt,
           next_attempt_at = case when v_attempt < max_attempts then now() + interval '1 minute' else null end,
           error_code = nullif(btrim(p_error_code), ''), error_detail = nullif(btrim(p_error_detail), ''),
           last_attempt_at = now(), updated_at = now()
     where id = p_document_id
     returning * into v_document;
    update da_next.orders set fiscal_status = 'ERRO' where id = v_document.order_id;
  end if;
  insert into da_next.fiscal_document_events
    (fiscal_document_id, attempt, event_type, status, provider_document_id, error_code, error_detail, response_summary)
  values
    (v_document.id, v_attempt, 'RESULTADO', p_status, p_provider_document_id,
     nullif(btrim(p_error_code), ''), nullif(btrim(p_error_detail), ''), coalesce(p_response_summary, '{}'::jsonb))
  on conflict (fiscal_document_id, attempt, event_type) do update set
    status = excluded.status, provider_document_id = excluded.provider_document_id,
    error_code = excluded.error_code, error_detail = excluded.error_detail,
    response_summary = excluded.response_summary;
  return da_next.fiscal_document_projection(v_document.id) || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function da_next.fiscal_document_projection(uuid) from public, anon, authenticated;
revoke all on function public.admin_request_fiscal_document(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_record_fiscal_result(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_request_fiscal_document(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_record_fiscal_result(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;

comment on table da_next.fiscal_document_items is
  'Snapshot fiscal privado do pedido; não é sincronização Bling e não expõe custo ou credencial.';
comment on table da_next.fiscal_document_events is
  'Auditoria de solicitações e resultados fiscais; R13 não executa transporte externo.';
