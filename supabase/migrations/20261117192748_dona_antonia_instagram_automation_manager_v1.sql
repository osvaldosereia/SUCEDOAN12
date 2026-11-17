-- Instagram automation manager: private schedule, execution and audit records.
create table public.da_instagram_automations_v1 (
 id uuid primary key default gen_random_uuid(),
 automation_key text not null unique,
 name text not null check (length(btrim(name)) between 2 and 80),
 content_format text not null check (content_format in ('story','feed','carousel')),
 source_type text not null default 'daily_offers' check (source_type = 'daily_offers'),
 status text not null default 'active' check (status in ('active','paused','archived')),
 schedule_days smallint[] not null default array[1,2,3,4,5,6]::smallint[] check (cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[1,2,3,4,5,6,7]::smallint[]),
 schedule_times text[] not null default array['07:05']::text[] check (cardinality(schedule_times) between 1 and 8),
 time_zone text not null default 'America/Cuiaba' check (time_zone = 'America/Cuiaba'),
 products_per_post smallint not null default 1 check (products_per_post between 1 and 48),
 caption_template text not null default '' check (length(caption_template) <= 2200),
 last_run_at timestamptz, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.da_instagram_jobs_v1 (
 id uuid primary key default gen_random_uuid(),
 automation_id uuid not null references public.da_instagram_automations_v1(id) on delete restrict,
 automation_name text not null, content_format text not null check (content_format in ('story','feed','carousel')),
 source_type text not null default 'daily_offers' check (source_type = 'daily_offers'),
 scheduled_for timestamptz not null, run_kind text not null default 'scheduled' check (run_kind in ('scheduled','manual')),
 source_date date, status text not null default 'queued' check (status in ('queued','running','pending','assets_ready','container_created','publishing','published','failed','needs_review','skipped')),
 products_per_post smallint not null check (products_per_post between 1 and 48),
 selected_products jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_products) = 'array'),
 caption text not null default '' check (length(caption) <= 2200),
 meta_creation_id text, meta_media_id text, attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
 last_error text, result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
 published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (automation_id, scheduled_for)
);
create table public.da_instagram_job_items_v1 (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.da_instagram_jobs_v1(id) on delete cascade,
 item_number smallint not null check (item_number between 1 and 48), product_id uuid,
 product_name text not null default '', asset_path text, creation_id text, meta_media_id text,
 status text not null default 'queued' check (status in ('queued','asset_ready','container_created','published','failed','needs_review')),
 last_error text, published_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique (job_id, item_number)
);
create table public.da_instagram_job_events_v1 (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.da_instagram_jobs_v1(id) on delete cascade,
 event_type text not null check (length(event_type) between 2 and 40),
 message text not null default '' check (length(message) <= 500),
 details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
 created_at timestamptz not null default now()
);
create index da_instagram_automations_v1_status_idx on public.da_instagram_automations_v1(status, updated_at desc);
create index da_instagram_jobs_v1_automation_date_idx on public.da_instagram_jobs_v1(automation_id, scheduled_for desc);
create index da_instagram_jobs_v1_status_date_idx on public.da_instagram_jobs_v1(status, scheduled_for desc);
create index da_instagram_job_items_v1_job_idx on public.da_instagram_job_items_v1(job_id, item_number);
create index da_instagram_job_events_v1_job_idx on public.da_instagram_job_events_v1(job_id, created_at desc);
alter table public.da_instagram_automations_v1 enable row level security;
alter table public.da_instagram_jobs_v1 enable row level security;
alter table public.da_instagram_job_items_v1 enable row level security;
alter table public.da_instagram_job_events_v1 enable row level security;
revoke all on public.da_instagram_automations_v1, public.da_instagram_jobs_v1, public.da_instagram_job_items_v1, public.da_instagram_job_events_v1 from public, anon, authenticated;
grant all on public.da_instagram_automations_v1, public.da_instagram_jobs_v1, public.da_instagram_job_items_v1, public.da_instagram_job_events_v1 to service_role;
grant usage, select on sequence public.da_instagram_job_events_v1_id_seq to service_role;

create or replace function public.da_instagram_materialize_due_v1(p_now timestamptz default now())
returns jsonb language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_created jsonb;
begin
 with due as (
   select a.id automation_id, a.name automation_name, a.content_format, a.source_type, a.products_per_post, a.caption_template,
     (clock_data.local_now::date + slot.schedule_time::time) at time zone a.time_zone scheduled_for
   from public.da_instagram_automations_v1 a
   cross join lateral unnest(a.schedule_times) as slot(schedule_time)
   cross join lateral (select p_now at time zone a.time_zone as local_now) clock_data
   where a.status='active'
     and slot.schedule_time ~ '^(?:[01][0-9]|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$'
     and extract(isodow from clock_data.local_now)::smallint = any(a.schedule_days)
     and clock_data.local_now >= (clock_data.local_now::date + slot.schedule_time::time)
     and clock_data.local_now < (clock_data.local_now::date + slot.schedule_time::time) + interval '10 minutes'
 ), inserted as (
   insert into public.da_instagram_jobs_v1(automation_id,automation_name,content_format,source_type,scheduled_for,run_kind,products_per_post,caption)
   select automation_id,automation_name,content_format,source_type,scheduled_for,'scheduled',products_per_post,caption_template
   from due on conflict (automation_id,scheduled_for) do nothing
   returning id,automation_id,scheduled_for
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'automation_id',automation_id,'scheduled_for',scheduled_for)),'[]'::jsonb)
 into v_created from inserted;
 return v_created;
end
$function$;
revoke all on function public.da_instagram_materialize_due_v1(timestamptz) from public, anon, authenticated;
grant execute on function public.da_instagram_materialize_due_v1(timestamptz) to service_role;

insert into public.da_instagram_automations_v1(automation_key,name,content_format,source_type,status,schedule_days,schedule_times,time_zone,products_per_post,caption_template)
values ('daily-offers-stories-v1','Ofertas do dia — Stories','story','daily_offers','active',array[1,2,3,4,5,6]::smallint[],array['07:05']::text[],'America/Cuiaba',48,'')
on conflict (automation_key) do nothing;
