-- CM-1.1: defesa em profundidade para tabelas server-only.
-- Política aprovada: deny-by-default para anon/authenticated; acesso interno permanece via service_role/postgres.

alter table if exists public.agent_eval_release_markers enable row level security;
alter table if exists public.whatsapp_basket_media_assets enable row level security;
alter table if exists public.whatsapp_direct_config enable row level security;
alter table if exists public.whatsapp_direct_events enable row level security;
alter table if exists public.whatsapp_direct_state enable row level security;
alter table if exists public.whatsapp_direct_templates enable row level security;

revoke all on table public.agent_eval_release_markers from anon, authenticated;
revoke all on table public.whatsapp_basket_media_assets from anon, authenticated;
revoke all on table public.whatsapp_direct_config from anon, authenticated;
revoke all on table public.whatsapp_direct_events from anon, authenticated;
revoke all on table public.whatsapp_direct_state from anon, authenticated;
revoke all on table public.whatsapp_direct_templates from anon, authenticated;
