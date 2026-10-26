create table whatsapp_atendimento.channel_flow_bindings (
  channel text primary key check (channel in ('0975', '1018')),
  whatsapp_account_id uuid not null unique references public.whatsapp_accounts(id) on delete cascade,
  meta_flow_id text not null unique check (meta_flow_id ~ '^[0-9]{5,32}$'),
  flow_message_version text not null default '3' check (flow_message_version = '3'),
  flow_cta text not null default 'Montar cesta' check (length(flow_cta) between 1 and 20),
  flow_action text not null default 'navigate' check (flow_action = 'navigate'),
  first_screen text not null default 'GROUP' check (first_screen = 'GROUP'),
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table whatsapp_atendimento.channel_flow_uploads (
  channel text not null check (channel in ('0975', '1018')),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  meta_flow_id text not null unique check (meta_flow_id ~ '^[0-9]{5,32}$'),
  basket_id text not null check (basket_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  catalog_revision text not null check (catalog_revision ~ '^[0-9a-f]{40}:[0-9a-f]{40}$'),
  flow_json_sha256 text not null check (flow_json_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  primary key (channel, meta_flow_id)
);

alter table whatsapp_atendimento.channel_flow_bindings enable row level security;
alter table whatsapp_atendimento.channel_flow_uploads enable row level security;
revoke all on whatsapp_atendimento.channel_flow_bindings from public, anon, authenticated;
revoke all on whatsapp_atendimento.channel_flow_uploads from public, anon, authenticated;
grant select, insert, update, delete on whatsapp_atendimento.channel_flow_bindings to service_role;
grant select, insert, update, delete on whatsapp_atendimento.channel_flow_uploads to service_role;

comment on table whatsapp_atendimento.channel_flow_bindings is
  'Private greenfield mapping of each WhatsApp channel to its verified, published basket Flow; never exposed through the public API.';
comment on table whatsapp_atendimento.channel_flow_uploads is
  'Private evidence that a basket Flow JSON generated and validated by this greenfield Admin was uploaded to the corresponding Meta account.';
