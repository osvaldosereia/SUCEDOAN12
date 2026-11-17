create table if not exists public.da_instagram_story_creatives_v1 (
  id uuid primary key default gen_random_uuid(),
  phrase text not null check (char_length(btrim(phrase)) between 1 and 160),
  theme text not null check (char_length(btrim(theme)) between 2 and 160),
  extra_info text not null default '' check (char_length(extra_info) <= 240),
  status text not null default 'generating' check (status in ('generating','ready','publishing','published','failed','needs_review')),
  image_path text,
  image_size_bytes integer check (image_size_bytes is null or (image_size_bytes between 1 and 102400)),
  model text not null default 'gpt-image-2' check (model = 'gpt-image-2'),
  quality text not null default 'low' check (quality = 'low'),
  estimated_cost_usd numeric(10,6) not null default 0.005 check (estimated_cost_usd >= 0),
  meta_creation_id text,
  meta_media_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists da_instagram_story_creatives_v1_created_idx
  on public.da_instagram_story_creatives_v1 (created_at desc);
create index if not exists da_instagram_story_creatives_v1_status_idx
  on public.da_instagram_story_creatives_v1 (status, updated_at desc);
alter table public.da_instagram_story_creatives_v1 enable row level security;
revoke all on table public.da_instagram_story_creatives_v1 from anon, authenticated;
grant all on table public.da_instagram_story_creatives_v1 to service_role;
comment on table public.da_instagram_story_creatives_v1 is
  'Rascunhos de Stories gerados sob demanda e publicados somente após aprovação manual no admin.';