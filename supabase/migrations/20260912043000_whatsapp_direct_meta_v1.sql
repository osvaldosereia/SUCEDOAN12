begin;

create table if not exists public.whatsapp_direct_config (
  id smallint primary key default 1 check (id=1),
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete restrict,
  enabled boolean not null default false,
  release_mode text not null default 'off' check (release_mode in ('off','homologation','live')),
  storefront_url text not null default 'https://donaantonia.com.br/vitrine-v3/',
  public_phone text,
  greeting_text text not null default 'Olá! Como posso ajudar?',
  catalog_text text not null default E'Para escolher sua cesta ou comprar produtos, acesse:\nhttps://donaantonia.com.br/vitrine-v3/',
  address_request_text text not null default E'Para finalizar seu pedido, envie o endereço neste formato:\nRua: ...\nQuadra: ...\nCasa/Número: ...\nBairro: ...\nReferência: ...\nDepois envie também sua localização pelo WhatsApp 📍.',
  address_audio_url text,
  require_location boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_direct_config(id,whatsapp_account_id)
select 1,id from public.whatsapp_accounts where is_active=true order by created_at asc limit 1
on conflict(id) do update set whatsapp_account_id=coalesce(public.whatsapp_direct_config.whatsapp_account_id,excluded.whatsapp_account_id);

create table if not exists public.whatsapp_direct_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  state text not null default 'IDLE' check (state in (
    'IDLE','MENU','ORDER_RECEIVED','ADDRESS_CONFIRMATION','WAITING_ADDRESS','WAITING_LOCATION',
    'ADDRESS_REVIEW','ADDRESS_CONFIRMED','HUMAN_HANDOFF'
  )),
  address_draft jsonb not null default '{}'::jsonb,
  latitude numeric,
  longitude numeric,
  location_url text,
  last_button_id text,
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_direct_state_order_idx on public.whatsapp_direct_state(order_id);
create index if not exists whatsapp_direct_state_customer_idx on public.whatsapp_direct_state(customer_id);

create table if not exists public.whatsapp_direct_templates (
  template_key text primary key,
  meta_template_name text,
  category text not null default 'UTILITY' check (category='UTILITY'),
  language_code text not null default 'pt_BR',
  purpose text not null,
  body_text text not null,
  media_kind text not null default 'none' check (media_kind in ('none','image')),
  media_url text,
  buttons jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  meta_status text not null default 'not_configured',
  updated_at timestamptz not null default now()
);
insert into public.whatsapp_direct_templates(template_key,purpose,body_text,buttons)
values
 ('order_received','Confirmar recebimento de pedido',E'Recebemos seu pedido nº {{1}}. ✅\nVamos conferir o endereço de entrega.', '[{"id":"address_continue","title":"Continuar"},{"id":"human_support","title":"Atendente"}]'::jsonb),
 ('address_confirm','Confirmar endereço de entrega',E'Para o pedido {{1}}, encontramos este endereço:\n\n{{2}}\n\nPodemos entregar aqui?', '[{"id":"address_confirm","title":"Confirmar"},{"id":"address_change","title":"Alterar endereço"},{"id":"human_support","title":"Atendente"}]'::jsonb),
 ('order_confirmed','Confirmar conclusão do atendimento do pedido',E'Pedido nº {{1}} confirmado. ✅\nPagamento na entrega.', '[{"id":"human_support","title":"Atendente"}]'::jsonb)
on conflict(template_key) do nothing;

create table if not exists public.whatsapp_direct_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  whatsapp_message_id text,
  event_type text not null,
  direction text not null default 'system' check (direction in ('inbound','outbound','system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists whatsapp_direct_events_message_event_uidx on public.whatsapp_direct_events(whatsapp_message_id,event_type) where whatsapp_message_id is not null;
create index if not exists whatsapp_direct_events_conversation_idx on public.whatsapp_direct_events(conversation_id,created_at desc);

create table if not exists public.whatsapp_basket_media_assets (
  basket_id uuid primary key references public.basket_templates(id) on delete cascade,
  vertical_image_url text,
  source_hash text,
  width integer not null default 1080,
  height integer not null default 1920,
  status text not null default 'not_generated' check (status in ('not_generated','ready','stale','error')),
  updated_at timestamptz not null default now()
);

alter table public.customer_addresses add column if not exists block text;
alter table public.customer_addresses add column if not exists latitude numeric;
alter table public.customer_addresses add column if not exists longitude numeric;

revoke all on table public.whatsapp_direct_config from anon,authenticated;
revoke all on table public.whatsapp_direct_state from anon,authenticated;
revoke all on table public.whatsapp_direct_templates from anon,authenticated;
revoke all on table public.whatsapp_direct_events from anon,authenticated;
revoke all on table public.whatsapp_basket_media_assets from anon,authenticated;

commit;
