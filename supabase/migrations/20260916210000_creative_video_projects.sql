create table if not exists public.creative_video_projects (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_snapshot jsonb not null default '{}'::jsonb,
  briefing text,
  creative_plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','collecting_assets','curating','ready','rendering','review','completed','archived')),
  current_version integer not null default 0 check (current_version >= 0),
  target_budget_brl numeric(10,4) not null default 1.0000 check (target_budget_brl >= 0),
  adjustment_budget_brl numeric(10,4) not null default 1.0000 check (adjustment_budget_brl >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_video_project_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  scene_index integer not null check (scene_index >= 0),
  start_seconds numeric(7,3),
  end_seconds numeric(7,3),
  intent text,
  scene_plan jsonb not null default '{}'::jsonb,
  composition jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, scene_index),
  check (start_seconds is null or start_seconds >= 0),
  check (end_seconds is null or end_seconds >= 0),
  check (start_seconds is null or end_seconds is null or end_seconds > start_seconds)
);

create table if not exists public.creative_video_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  scene_id uuid references public.creative_video_project_scenes(id) on delete set null,
  library_asset_id uuid,
  asset_kind text not null check (asset_kind in ('packshot','library','external','procedural','ai_grid')),
  need text,
  description text,
  tags text[] not null default '{}',
  source_name text,
  source_url text,
  license_name text,
  license_url text,
  local_storage_path text,
  preview_url text,
  relevance_score numeric(5,4) check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)),
  curation_status text not null default 'candidate' check (curation_status in ('candidate','selected','rejected','fixed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_video_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  parent_version_id uuid references public.creative_video_versions(id) on delete set null,
  change_summary text,
  snapshot jsonb not null,
  render_job_id uuid references public.creative_studio_jobs(id) on delete set null,
  output_path text,
  output_metadata jsonb not null default '{}'::jsonb,
  actual_cost_brl numeric(10,4) not null default 0 check (actual_cost_brl >= 0),
  status text not null default 'draft' check (status in ('draft','queued','rendering','review','approved','failed')),
  created_at timestamptz not null default now(),
  unique(project_id, version_number)
);

create table if not exists public.creative_video_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  source_version_id uuid references public.creative_video_versions(id) on delete set null,
  target_version_id uuid references public.creative_video_versions(id) on delete set null,
  instruction text not null,
  interpreted_delta jsonb not null default '{}'::jsonb,
  affected_scene_indexes integer[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','interpreted','applied','rejected','failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists creative_video_projects_product_idx on public.creative_video_projects(product_id, created_at desc);
create index if not exists creative_video_projects_status_idx on public.creative_video_projects(status, updated_at desc);
create index if not exists creative_video_project_assets_project_idx on public.creative_video_project_assets(project_id, curation_status, relevance_score desc);
create index if not exists creative_video_project_assets_tags_idx on public.creative_video_project_assets using gin(tags);
create index if not exists creative_video_versions_project_idx on public.creative_video_versions(project_id, version_number desc);
create index if not exists creative_video_feedback_project_idx on public.creative_video_feedback(project_id, created_at desc);

alter table public.creative_video_projects enable row level security;
alter table public.creative_video_project_scenes enable row level security;
alter table public.creative_video_project_assets enable row level security;
alter table public.creative_video_versions enable row level security;
alter table public.creative_video_feedback enable row level security;

comment on table public.creative_video_projects is 'Fonte de verdade editável para cada produção do Estúdio Criativo.';
comment on table public.creative_video_versions is 'Snapshots imutáveis das versões renderizáveis de um projeto criativo.';
comment on table public.creative_video_feedback is 'Feedback humano estruturado para ajustes incrementais sem recriar o projeto.';
