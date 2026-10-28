create table public.whatsapp_conversation_order_overrides_v1 (
  admin_user_id uuid not null references public.admin_users(user_id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  mode text not null check (mode in ('include', 'exclude')),
  updated_at timestamptz not null default now(),
  primary key (admin_user_id, conversation_id)
);

create index whatsapp_conversation_order_overrides_v1_admin_updated_idx
  on public.whatsapp_conversation_order_overrides_v1 (admin_user_id, updated_at desc, conversation_id asc);

alter table public.whatsapp_conversation_order_overrides_v1 enable row level security;

revoke all on table public.whatsapp_conversation_order_overrides_v1 from public, anon, authenticated;
grant all on table public.whatsapp_conversation_order_overrides_v1 to service_role;
