create table if not exists public.ame_mais_runs (
  id uuid primary key,
  status text not null default 'processing' check (status in ('processing','completed','error')),
  step text not null default 'preparing_photo',
  source_url text,
  analysis jsonb not null default '{}'::jsonb,
  images jsonb not null default '{}'::jsonb,
  model_analysis text,
  model_image text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ame_mais_runs_created_at_idx on public.ame_mais_runs (created_at desc);

alter table public.ame_mais_runs enable row level security;
revoke all on table public.ame_mais_runs from anon, authenticated;
grant all on table public.ame_mais_runs to service_role;

create table if not exists public.ame_mais_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ame_mais_rate_limits enable row level security;
revoke all on table public.ame_mais_rate_limits from anon, authenticated;
grant all on table public.ame_mais_rate_limits to service_role;
