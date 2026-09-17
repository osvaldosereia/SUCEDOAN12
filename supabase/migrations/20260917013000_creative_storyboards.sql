create table if not exists public.creative_video_project_products (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, product_snapshot jsonb not null default '{}'::jsonb,
  role text not null default 'support', sort_order integer not null default 0, created_at timestamptz not null default now(), unique(project_id,product_id)
);
create table if not exists public.creative_storyboard_keyframes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  second_mark integer not null check(second_mark>=0), visual_prompt text not null, continuity_lock jsonb not null default '{}'::jsonb,
  image_path text, image_url text, status text not null default 'planned' check(status in ('planned','generating','ready','error','stale')),
  provider_usage jsonb not null default '{}'::jsonb, actual_cost_brl numeric(10,4) not null default 0, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,second_mark)
);
create table if not exists public.creative_storyboard_gemini_packages (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creative_video_projects(id) on delete cascade,
  package_index integer not null, start_second integer not null, middle_second integer not null, end_second integer not null,
  prompt text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,package_index)
);
create index if not exists creative_project_products_project_idx on public.creative_video_project_products(project_id,sort_order);
create index if not exists creative_storyboard_keyframes_project_idx on public.creative_storyboard_keyframes(project_id,second_mark);
create index if not exists creative_storyboard_packages_project_idx on public.creative_storyboard_gemini_packages(project_id,package_index);
alter table public.creative_video_project_products enable row level security;
alter table public.creative_storyboard_keyframes enable row level security;
alter table public.creative_storyboard_gemini_packages enable row level security;
comment on table public.creative_storyboard_keyframes is 'Keyframes verticais 9:16 do storyboard, encadeados em passos de 5 segundos.';
comment on table public.creative_storyboard_gemini_packages is 'Pacotes manuais de tres referencias e prompt para gerar cada trecho no app Gemini.';