-- Creative Studio V1: generalize the existing asset catalog without destructive renames.
alter table public.stopmotion_assets add column if not exists asset_type text;
alter table public.stopmotion_assets add column if not exists object_name text;
alter table public.stopmotion_assets add column if not exists concepts text[] not null default '{}'::text[];
alter table public.stopmotion_assets add column if not exists actions_compatible text[] not null default '{}'::text[];
alter table public.stopmotion_assets add column if not exists visual_roles text[] not null default '{}'::text[];
alter table public.stopmotion_assets add column if not exists styles text[] not null default '{}'::text[];
alter table public.stopmotion_assets add column if not exists orientation text;
alter table public.stopmotion_assets add column if not exists background_type text;
alter table public.stopmotion_assets add column if not exists transparent boolean;
alter table public.stopmotion_assets add column if not exists quality_score numeric(5,4) not null default 0;
alter table public.stopmotion_assets add column if not exists usage_count integer not null default 0;
alter table public.stopmotion_assets add column if not exists last_used_at timestamptz;
alter table public.stopmotion_assets add column if not exists source_provider text;
alter table public.stopmotion_assets add column if not exists source_asset_id text;
alter table public.stopmotion_assets add column if not exists license_url text;
alter table public.stopmotion_assets add column if not exists license_validated boolean not null default false;
alter table public.stopmotion_assets add column if not exists acquired_at timestamptz;
alter table public.stopmotion_assets add column if not exists search_vector tsvector;

create or replace function public.creative_studio_assets_search_vector_sync()
returns trigger language plpgsql set search_path=public as $$
begin
  new.search_vector := to_tsvector('simple', concat_ws(' ',
    coalesce(new.name,''), coalesce(new.object_name,''), coalesce(new.category,''),
    array_to_string(coalesce(new.tags,'{}'::text[]),' '),
    array_to_string(coalesce(new.concepts,'{}'::text[]),' '),
    array_to_string(coalesce(new.actions_compatible,'{}'::text[]),' '),
    array_to_string(coalesce(new.visual_roles,'{}'::text[]),' '),
    array_to_string(coalesce(new.styles,'{}'::text[]),' ')
  ));
  return new;
end $$;

drop trigger if exists trg_creative_studio_assets_search_vector on public.stopmotion_assets;
create trigger trg_creative_studio_assets_search_vector before insert or update of name,object_name,category,tags,concepts,actions_compatible,visual_roles,styles on public.stopmotion_assets for each row execute function public.creative_studio_assets_search_vector_sync();

update public.stopmotion_assets set search_vector=to_tsvector('simple',concat_ws(' ',coalesce(name,''),coalesce(object_name,''),coalesce(category,''),array_to_string(coalesce(tags,'{}'::text[]),' '),array_to_string(coalesce(concepts,'{}'::text[]),' '),array_to_string(coalesce(actions_compatible,'{}'::text[]),' '),array_to_string(coalesce(visual_roles,'{}'::text[]),' '),array_to_string(coalesce(styles,'{}'::text[]),' ')));
create index if not exists idx_stopmotion_assets_search_vector on public.stopmotion_assets using gin(search_vector);
create index if not exists idx_stopmotion_assets_concepts on public.stopmotion_assets using gin(concepts);
create index if not exists idx_stopmotion_assets_actions on public.stopmotion_assets using gin(actions_compatible);
create index if not exists idx_stopmotion_assets_safe_available on public.stopmotion_assets(commercial_use_allowed,ingest_status,quality_score desc);
create unique index if not exists uq_stopmotion_assets_provider_asset on public.stopmotion_assets(source_provider,source_asset_id) where source_provider is not null and source_asset_id is not null;

create table if not exists public.creative_studio_memory (
 id uuid primary key default gen_random_uuid(), product_id uuid null, product_name text not null, product_category text,
 territory text not null, concept text not null, hook text, story_signature text,
 duration_seconds integer not null check(duration_seconds between 15 and 25), asset_ids uuid[] not null default '{}'::uuid[], motions text[] not null default '{}'::text[], created_at timestamptz not null default now()
);
alter table public.creative_studio_memory enable row level security;
create index if not exists idx_creative_studio_memory_product_created on public.creative_studio_memory(product_id,created_at desc);
create index if not exists idx_creative_studio_memory_territory_created on public.creative_studio_memory(territory,created_at desc);

create table if not exists public.creative_studio_asset_requests (
 id uuid primary key default gen_random_uuid(), job_key text, need text not null, keywords text[] not null default '{}'::text[], visual_role text,
 actions text[] not null default '{}'::text[], status text not null default 'pending' check(status in ('pending','resolved_local','procedural','hunting','acquired','missing','blocked')),
 resolved_asset_id uuid references public.stopmotion_assets(id) on delete set null, external_acquisition boolean not null default false,
 created_at timestamptz not null default now(), resolved_at timestamptz
);
alter table public.creative_studio_asset_requests enable row level security;
create index if not exists idx_creative_asset_requests_job_status on public.creative_studio_asset_requests(job_key,status);
