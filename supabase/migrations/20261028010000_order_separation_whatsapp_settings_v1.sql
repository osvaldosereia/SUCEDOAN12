begin;

create table if not exists public.order_separation_whatsapp_settings_v1 (
  notification_kind text not null check (notification_kind in ('prepared_ok', 'prepared_adjusted')),
  channel text not null check (channel in ('0975', '1018')),
  is_enabled boolean not null default true,
  draft_body text not null,
  active_template_name text not null,
  pending_template_name text,
  updated_at timestamptz not null default now(),
  primary key (notification_kind, channel)
);

alter table public.order_separation_whatsapp_settings_v1 enable row level security;
revoke all on table public.order_separation_whatsapp_settings_v1 from public, anon, authenticated;
grant all on table public.order_separation_whatsapp_settings_v1 to service_role;

drop policy if exists order_separation_whatsapp_settings_service_role_all
  on public.order_separation_whatsapp_settings_v1;
create policy order_separation_whatsapp_settings_service_role_all
  on public.order_separation_whatsapp_settings_v1
  for all
  to service_role
  using (true)
  with check (true);

insert into public.order_separation_whatsapp_settings_v1
  (notification_kind, channel, is_enabled, draft_body, active_template_name, pending_template_name)
values
  ('prepared_ok', '0975', true,
   E'✅ Pedido {{1}} preparado\n\nEncontramos todos os produtos do seu pedido.\n\n💰 Total confirmado: {{2}}\n\n🚚 Seu pedido está pronto e seguirá para a rota de entrega.\n\nConfira os detalhes:\n{{3}}\n\nDona Antônia agradece a preferência.',
   'pedidopreparadook0975v1', null),
  ('prepared_ok', '1018', true,
   E'✅ Pedido {{1}} preparado\n\nEncontramos todos os produtos do seu pedido.\n\n💰 Total confirmado: {{2}}\n\n🚚 Seu pedido está pronto e seguirá para a rota de entrega.\n\nConfira os detalhes:\n{{3}}\n\nDona Antônia agradece a preferência.',
   'pedidopreparadook1018v1', null),
  ('prepared_adjusted', '0975', true,
   E'⚠️ Pedido {{1}} preparado com ajuste\n\nDurante a separação, alguns produtos não estavam disponíveis:\n\n{{2}}\n\n💰 RESUMO DO PEDIDO\nValor original: {{3}}\nAbatimento: - {{4}}\nNovo total: {{5}}\n\nOs demais produtos foram separados normalmente e seu pedido está pronto para seguir para a rota de entrega.\n\nConfira os detalhes:\n{{6}}\n\nDona Antônia agradece a compreensão.',
   'pedidopreparadoajuste0975v1', null),
  ('prepared_adjusted', '1018', true,
   E'⚠️ Pedido {{1}} preparado com ajuste\n\nDurante a separação, alguns produtos não estavam disponíveis:\n\n{{2}}\n\n💰 RESUMO DO PEDIDO\nValor original: {{3}}\nAbatimento: - {{4}}\nNovo total: {{5}}\n\nOs demais produtos foram separados normalmente e seu pedido está pronto para seguir para a rota de entrega.\n\nConfira os detalhes:\n{{6}}\n\nDona Antônia agradece a compreensão.',
   'pedidopreparadoajuste1018v1', null)
on conflict (notification_kind, channel) do nothing;

commit;
