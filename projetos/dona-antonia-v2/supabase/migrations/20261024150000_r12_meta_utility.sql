-- R12: Meta utility message preparation in isolated V2.
-- Templates, routing and delivery state are persisted, but no transport worker
-- or Meta/WhatsApp request is activated by this migration.

create table da_next.whatsapp_utility_settings (
  provider_account text primary key check (provider_account in ('0975', '1018')),
  enabled boolean not null default false,
  is_default boolean not null default false,
  daily_budget integer not null default 0 check (daily_budget between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger whatsapp_utility_settings_touch_updated_at
before update on da_next.whatsapp_utility_settings
for each row execute function da_next.touch_updated_at();
insert into da_next.whatsapp_utility_settings (provider_account, enabled, is_default, daily_budget)
values ('0975', false, true, 0), ('1018', false, false, 0);

create table da_next.whatsapp_utility_templates (
  id uuid primary key default gen_random_uuid(),
  provider_account text not null references da_next.whatsapp_utility_settings(provider_account) on delete restrict,
  event_type text not null check (event_type in ('OrderReceived', 'OrderSeparating', 'OrderReady', 'OrderDelivered')),
  template_name text not null check (template_name = lower(template_name) and template_name ~ '^[a-z0-9_]{3,128}$'),
  language_code text not null default 'pt_BR' check (language_code = 'pt_BR'),
  approval_status text not null default 'PENDENTE' check (approval_status in ('PENDENTE', 'APROVADO', 'REJEITADO')),
  active boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account, event_type),
  unique (provider_account, template_name),
  check ((active and approval_status = 'APROVADO') or not active)
);
create trigger whatsapp_utility_templates_touch_updated_at
before update on da_next.whatsapp_utility_templates
for each row execute function da_next.touch_updated_at();
insert into da_next.whatsapp_utility_templates (provider_account, event_type, template_name)
select account.provider_account, event.event_type, 'dona_antonia_' || lower(replace(event.event_type, 'Order', 'order_'))
from (values ('0975'), ('1018')) as account(provider_account)
cross join (values
  ('OrderReceived'), ('OrderSeparating'), ('OrderReady'), ('OrderDelivered')
) as event(event_type);

create table da_next.whatsapp_utility_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references da_next.orders(id) on delete restrict,
  template_id uuid not null references da_next.whatsapp_utility_templates(id) on delete restrict,
  provider_account text not null check (provider_account in ('0975', '1018')),
  event_type text not null check (event_type in ('OrderReceived', 'OrderSeparating', 'OrderReady', 'OrderDelivered')),
  phone_snapshot text not null check (phone_snapshot ~ '^[0-9]{10,11}$'),
  delivery_status text not null default 'NA_FILA' check (delivery_status in ('NA_FILA', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA', 'FALHA_FINAL')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  provider_message_id text,
  last_error_code text,
  next_attempt_at timestamptz,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((delivery_status = 'FALHA_FINAL' and attempts >= max_attempts) or delivery_status <> 'FALHA_FINAL')
);
create index whatsapp_utility_messages_status_due
  on da_next.whatsapp_utility_messages (delivery_status, next_attempt_at, created_at);
create index whatsapp_utility_messages_order_timeline
  on da_next.whatsapp_utility_messages (order_id, created_at desc);
create trigger whatsapp_utility_messages_touch_updated_at
before update on da_next.whatsapp_utility_messages
for each row execute function da_next.touch_updated_at();

alter table da_next.whatsapp_utility_settings enable row level security;
alter table da_next.whatsapp_utility_templates enable row level security;
alter table da_next.whatsapp_utility_messages enable row level security;

create policy utility_settings_admin_read on da_next.whatsapp_utility_settings
  for select to authenticated using (da_next.has_permission('admin.all'));
create policy utility_settings_admin_write on da_next.whatsapp_utility_settings
  for all to authenticated using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy utility_templates_support_read on da_next.whatsapp_utility_templates
  for select to authenticated using (da_next.has_permission('conversations.read'));
create policy utility_templates_admin_write on da_next.whatsapp_utility_templates
  for all to authenticated using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy utility_messages_support_read on da_next.whatsapp_utility_messages
  for select to authenticated using (da_next.has_permission('conversations.read'));
create policy utility_messages_admin_write on da_next.whatsapp_utility_messages
  for all to authenticated using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));

create or replace function da_next.enqueue_whatsapp_utility_for_order(
  p_order_id uuid,
  p_event_type text,
  p_order_version integer
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_setting da_next.whatsapp_utility_settings;
  v_template da_next.whatsapp_utility_templates;
  v_order da_next.orders;
  v_message_id uuid;
  v_key text;
begin
  select * into v_setting
  from da_next.whatsapp_utility_settings
  where enabled and daily_budget > 0
  order by is_default desc, provider_account
  limit 1;
  if not found then return; end if;

  select * into v_template
  from da_next.whatsapp_utility_templates
  where provider_account = v_setting.provider_account
    and event_type = p_event_type
    and active
    and approval_status = 'APROVADO';
  if not found then return; end if;

  select * into v_order from da_next.orders where id = p_order_id;
  if not found then return; end if;
  v_key := 'whatsapp-utility:' || p_order_id || ':' || p_event_type || ':' || v_setting.provider_account;

  insert into da_next.whatsapp_utility_messages (
    order_id, template_id, provider_account, event_type, phone_snapshot,
    delivery_status, attempts, max_attempts, next_attempt_at, idempotency_key
  ) values (
    v_order.id, v_template.id, v_setting.provider_account, p_event_type,
    v_order.customer_phone_snapshot, 'NA_FILA', 0, 3, now(), v_key
  ) on conflict (idempotency_key) do nothing
  returning id into v_message_id;

  if v_message_id is null then return; end if;
  insert into da_next.integration_outbox (
    aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key, payload
  ) values (
    'ORDER', v_order.id, p_order_version, 'WhatsAppUtilityQueued', v_key,
    jsonb_build_object(
      'messageId', v_message_id,
      'providerAccount', v_setting.provider_account,
      'templateName', v_template.template_name,
      'eventType', p_event_type
    )
  ) on conflict (idempotency_key) do nothing;
end;
$function$;

create or replace function da_next.on_order_received_whatsapp_utility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform da_next.enqueue_whatsapp_utility_for_order(new.id, 'OrderReceived', new.version);
  return new;
end;
$function$;

create or replace function da_next.on_order_event_whatsapp_utility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_event text;
begin
  v_event := case new.event_type
    when 'OrderStarted' then 'OrderSeparating'
    when 'OrderReady' then 'OrderReady'
    when 'OrderDelivered' then 'OrderDelivered'
    else null
  end;
  if v_event is not null then
    perform da_next.enqueue_whatsapp_utility_for_order(new.order_id, v_event, new.version);
  end if;
  return new;
end;
$function$;

create trigger orders_enqueue_whatsapp_utility_received
after insert on da_next.orders
for each row execute function da_next.on_order_received_whatsapp_utility();
create trigger order_events_enqueue_whatsapp_utility
after insert on da_next.order_events
for each row execute function da_next.on_order_event_whatsapp_utility();

create or replace function public.admin_list_whatsapp_utility_messages(
  p_provider_account text,
  p_delivery_status text,
  p_search text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 30)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_account text := nullif(btrim(coalesce(p_provider_account, '')), '');
  v_status text := nullif(btrim(coalesce(p_delivery_status, '')), '');
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  if not da_next.has_permission('conversations.read') then
    raise exception using errcode = '42501', message = 'Permissão de mensagens utilitárias necessária.';
  end if;
  if v_account is not null and v_account not in ('0975', '1018') then
    raise exception using errcode = '22023', message = 'Conta WhatsApp inválida.';
  end if;
  if v_status is not null and v_status not in ('NA_FILA', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA', 'FALHA_FINAL') then
    raise exception using errcode = '22023', message = 'Status utilitário inválido.';
  end if;

  select count(*)::integer into v_total
  from da_next.whatsapp_utility_messages as m
  join da_next.orders as o on o.id = m.order_id
  where (v_account is null or m.provider_account = v_account)
    and (v_status is null or m.delivery_status = v_status)
    and (v_search is null or lower(concat_ws(' ', o.order_number, m.phone_snapshot, m.event_type)) like '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(result) order by result.created_at desc, result.id), '[]'::jsonb)
    into v_items
  from (
    select m.id, m.order_id, o.order_number, m.provider_account, m.event_type,
      t.template_name, m.phone_snapshot, m.delivery_status, m.attempts,
      m.max_attempts, m.provider_message_id, m.last_error_code,
      m.next_attempt_at, m.created_at, m.updated_at
    from da_next.whatsapp_utility_messages as m
    join da_next.orders as o on o.id = m.order_id
    join da_next.whatsapp_utility_templates as t on t.id = m.template_id
    where (v_account is null or m.provider_account = v_account)
      and (v_status is null or m.delivery_status = v_status)
      and (v_search is null or lower(concat_ws(' ', o.order_number, m.phone_snapshot, m.event_type)) like '%' || v_search || '%')
    order by m.created_at desc, m.id
    limit v_limit offset v_offset
  ) as result;
  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$function$;

create or replace function public.admin_record_whatsapp_utility_result(
  p_message_id uuid,
  p_delivery_status text,
  p_provider_message_id text,
  p_error_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_message da_next.whatsapp_utility_messages;
  v_status text;
  v_attempts integer;
  v_next_attempt timestamptz;
begin
  if not da_next.has_permission('conversations.manage') then
    raise exception using errcode = '42501', message = 'Permissão de mensagens utilitárias necessária.';
  end if;
  if p_delivery_status not in ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA') then
    raise exception using errcode = '22023', message = 'Resultado utilitário inválido.';
  end if;
  select * into v_message from da_next.whatsapp_utility_messages where id = p_message_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Mensagem utilitária não encontrada.'; end if;

  v_attempts := v_message.attempts;
  v_next_attempt := null;
  if p_delivery_status = 'FALHA' then
    v_attempts := v_attempts + 1;
    v_status := case when v_attempts >= v_message.max_attempts then 'FALHA_FINAL' else 'NA_FILA' end;
    if v_status = 'NA_FILA' then v_next_attempt := now() + interval '1 minute'; end if;
  else
    v_status := p_delivery_status;
  end if;

  update da_next.whatsapp_utility_messages
     set delivery_status = v_status,
         attempts = v_attempts,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         last_error_code = case when p_delivery_status = 'FALHA' then nullif(btrim(p_error_code), '') else null end,
         next_attempt_at = v_next_attempt
   where id = p_message_id
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id, 'order_id', v_message.order_id,
    'order_number', (select order_number from da_next.orders where id = v_message.order_id),
    'provider_account', v_message.provider_account, 'event_type', v_message.event_type,
    'template_name', (select template_name from da_next.whatsapp_utility_templates where id = v_message.template_id),
    'phone_snapshot', v_message.phone_snapshot, 'delivery_status', v_message.delivery_status,
    'attempts', v_message.attempts, 'max_attempts', v_message.max_attempts,
    'provider_message_id', v_message.provider_message_id, 'last_error_code', v_message.last_error_code,
    'next_attempt_at', v_message.next_attempt_at, 'created_at', v_message.created_at, 'updated_at', v_message.updated_at
  );
end;
$function$;

revoke all on function public.admin_list_whatsapp_utility_messages(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_record_whatsapp_utility_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_list_whatsapp_utility_messages(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_record_whatsapp_utility_result(uuid, text, text, text) to authenticated;

comment on table da_next.whatsapp_utility_settings is
  'V2-only routing and daily budget; disabled by default until Meta policies and a test number are authorized.';
comment on table da_next.whatsapp_utility_templates is
  'Template registry for both official accounts; seeded as pending/inactive and never transmitted by migrations.';
comment on table da_next.whatsapp_utility_messages is
  'Idempotent utility delivery state and retry budget; no provider worker is enabled in R12.';
