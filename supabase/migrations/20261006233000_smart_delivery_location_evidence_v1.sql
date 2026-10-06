-- Smart Delivery Phase 1B: location evidence layer
-- A WhatsApp/driver/map location is evidence first; it must not silently overwrite a customer address.

create table if not exists public.customer_location_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  customer_address_id uuid references public.customer_addresses(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  conversation_id uuid,
  whatsapp_message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  source text not null check (source in ('customer_whatsapp','business_whatsapp','driver','admin','geocoder','import')),
  direction text check (direction is null or direction in ('inbound','outbound','internal')),
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  label text,
  address_text text,
  confidence text not null default 'unconfirmed' check (confidence in ('unconfirmed','probable','confirmed')),
  confirmation_source text,
  confirmed_at timestamptz,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_location_evidence_confirmation_ck check (
    (confidence <> 'confirmed') or confirmed_at is not null
  )
);

create unique index if not exists customer_location_evidence_message_uq
  on public.customer_location_evidence_v1(whatsapp_message_id)
  where whatsapp_message_id is not null;
create index if not exists customer_location_evidence_customer_idx
  on public.customer_location_evidence_v1(customer_id,captured_at desc);
create index if not exists customer_location_evidence_address_idx
  on public.customer_location_evidence_v1(customer_address_id,captured_at desc);
create index if not exists customer_location_evidence_order_idx
  on public.customer_location_evidence_v1(order_id,captured_at desc);

alter table public.customer_location_evidence_v1 enable row level security;

comment on table public.customer_location_evidence_v1 is
'Smart Delivery: immutable-ish evidence of real delivery locations. Evidence must be explicitly promoted/confirmed before changing a customer address.';
