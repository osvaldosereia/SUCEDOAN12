create table public.whatsapp_conversation_favorites_v1 (
  admin_user_id uuid not null references public.admin_users(user_id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_user_id, conversation_id)
);

create index whatsapp_conversation_favorites_v1_admin_created_idx
  on public.whatsapp_conversation_favorites_v1 (admin_user_id, created_at desc);

alter table public.whatsapp_conversation_favorites_v1 enable row level security;

revoke all on table public.whatsapp_conversation_favorites_v1 from public, anon, authenticated;
grant all on table public.whatsapp_conversation_favorites_v1 to service_role;
