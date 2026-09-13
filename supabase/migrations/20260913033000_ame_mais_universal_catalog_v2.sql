alter table public.ame_mais_runs
  add column if not exists scene_profile text,
  add column if not exists conflicts jsonb not null default '[]'::jsonb,
  add column if not exists observations jsonb not null default '[]'::jsonb,
  add column if not exists prompts jsonb not null default '{}'::jsonb,
  add column if not exists card_json jsonb not null default '{}'::jsonb;

create table if not exists public.ame_mais_images (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ame_mais_runs(id) on delete cascade,
  kind text not null check (kind in ('hero','lifestyle','detail')),
  title text not null,
  prompt text not null,
  image_url text,
  storage_path text,
  status text not null default 'pending' check (status in ('pending','generating','validating','completed','rejected','error')),
  validation jsonb not null default '{}'::jsonb,
  model text,
  quality text,
  size text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, kind)
);

create index if not exists idx_ame_mais_images_run_id on public.ame_mais_images(run_id);
create index if not exists idx_ame_mais_runs_created_at on public.ame_mais_runs(created_at desc);

alter table public.ame_mais_runs enable row level security;
alter table public.ame_mais_images enable row level security;

revoke all on public.ame_mais_runs from anon, authenticated;
revoke all on public.ame_mais_images from anon, authenticated;

grant select, insert, update, delete on public.ame_mais_runs to service_role;
grant select, insert, update, delete on public.ame_mais_images to service_role;
