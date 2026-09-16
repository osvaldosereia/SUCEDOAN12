alter table public.creative_studio_settings
  add column if not exists usd_brl_reference numeric(10,4) not null default 5.1428,
  add column if not exists director_input_usd_per_million numeric(12,6) not null default 0.20,
  add column if not exists director_cached_input_usd_per_million numeric(12,6) not null default 0.02,
  add column if not exists director_output_usd_per_million numeric(12,6) not null default 1.20,
  add column if not exists pricing_source text not null default 'openai_official',
  add column if not exists pricing_updated_at timestamptz;

update public.creative_studio_settings
set usd_brl_reference=5.1428,
    director_input_usd_per_million=0.20,
    director_cached_input_usd_per_million=0.02,
    director_output_usd_per_million=1.20,
    pricing_source='openai_official_2026-07-30',
    pricing_updated_at=now(),
    updated_at=now()
where id=1;
