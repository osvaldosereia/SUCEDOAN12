create table if not exists public.creative_storyboard_generation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  second_mark integer not null check (second_mark >= 0),
  model text not null,
  quality text not null,
  image_url text,
  provider_usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(12,6),
  created_at timestamptz not null default now()
);

alter table public.creative_storyboard_generation_events enable row level security;

create index if not exists creative_storyboard_generation_events_project_idx
  on public.creative_storyboard_generation_events(project_id, created_at);
