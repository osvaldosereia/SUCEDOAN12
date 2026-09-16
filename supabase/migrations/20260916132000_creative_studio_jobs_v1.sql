create table if not exists public.creative_studio_settings (
  id smallint primary key default 1 check(id=1),
  width integer not null default 1080 check(width between 360 and 2160),
  height integer not null default 1920 check(height between 640 and 3840),
  fps integer not null default 30 check(fps between 12 and 60),
  default_duration integer not null default 18 check(default_duration between 15 and 25),
  max_paid_cost_brl numeric(10,4) not null default 0.20 check(max_paid_cost_brl>=0),
  economy_mode boolean not null default true,
  allow_external_free_assets boolean not null default true,
  max_external_assets integer not null default 3 check(max_external_assets between 0 and 10),
  updated_at timestamptz not null default now()
);
alter table public.creative_studio_settings enable row level security;
insert into public.creative_studio_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.creative_studio_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_snapshot jsonb not null default '{}'::jsonb,
  creative_plan jsonb not null default '{}'::jsonb,
  resolved_assets jsonb not null default '{}'::jsonb,
  timeline jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check(status in ('draft','ready','queued','rendering','completed','failed','cancelled')),
  width integer not null default 1080,
  height integer not null default 1920,
  fps integer not null default 30,
  duration_seconds integer not null check(duration_seconds between 15 and 25),
  external_assets_used integer not null default 0 check(external_assets_used between 0 and 10),
  provider_usage jsonb not null default '{}'::jsonb,
  estimated_cost_brl numeric(10,4),
  actual_cost_brl numeric(10,4),
  requires_paid_approval boolean not null default false,
  render_strategy text not null default 'ffmpeg_svg',
  output_bucket text,
  output_path text,
  output_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_detail text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  render_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.creative_studio_jobs enable row level security;
create index if not exists idx_creative_studio_jobs_status_created on public.creative_studio_jobs(status,created_at desc);
create index if not exists idx_creative_studio_jobs_product_created on public.creative_studio_jobs(product_id,created_at desc);

create table if not exists public.creative_studio_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.creative_studio_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.creative_studio_job_events enable row level security;
create index if not exists idx_creative_studio_job_events_job on public.creative_studio_job_events(job_id,created_at);
