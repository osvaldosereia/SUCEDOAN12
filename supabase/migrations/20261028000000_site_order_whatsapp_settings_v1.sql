begin;

create table if not exists public.site_order_whatsapp_settings_v1 (
  channel text primary key check (channel in ('0975', '1018')),
  is_enabled boolean not null default true,
  draft_body text not null,
  active_template_name text not null,
  pending_template_name text,
  updated_at timestamptz not null default now()
);

alter table public.site_order_whatsapp_settings_v1 enable row level security;
revoke all on table public.site_order_whatsapp_settings_v1 from public, anon, authenticated;
grant all on table public.site_order_whatsapp_settings_v1 to service_role;

drop policy if exists site_order_whatsapp_settings_service_role_all
  on public.site_order_whatsapp_settings_v1;
create policy site_order_whatsapp_settings_service_role_all
  on public.site_order_whatsapp_settings_v1
  for all
  to service_role
  using (true)
  with check (true);

insert into public.site_order_whatsapp_settings_v1
  (channel, is_enabled, draft_body, active_template_name, pending_template_name)
values
  ('0975', true,
   E'🛒 PEDIDO DONA ANTÔNIA\n📅 Entrega: {{1}}\n🔢 Número: {{2}}\n\n👤 CLIENTE\nNome: {{3}}\nWhatsApp: {{4}}\n\n📍 ENTREGA\nEndereço: {{5}}\nBairro: {{6}}\nCidade: {{7}}\n\n💰 TOTAL: {{8}}\n💳 PAGAMENTO: {{9}}',
   'pedidoorganizadosite0975v3', null),
  ('1018', true,
   E'🛒 PEDIDO DONA ANTÔNIA\n📅 Entrega: {{1}}\n🔢 Número: {{2}}\n\n👤 CLIENTE\nNome: {{3}}\nWhatsApp: {{4}}\n\n📍 ENTREGA\nEndereço: {{5}}\nBairro: {{6}}\nCidade: {{7}}\n\n💰 TOTAL: {{8}}\n💳 PAGAMENTO: {{9}}',
   'pedidoorganizadosite1018v3', null)
on conflict (channel) do nothing;

commit;