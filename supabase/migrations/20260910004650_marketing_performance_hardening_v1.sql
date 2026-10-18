begin;

-- Cover Marketing Center foreign keys identified by Supabase performance advisor.
create index if not exists marketing_assets_campaign_idx on public.marketing_assets(campaign_id) where campaign_id is not null;
create index if not exists marketing_assets_parent_idx on public.marketing_assets(parent_asset_id) where parent_asset_id is not null;
create index if not exists marketing_assets_template_idx on public.marketing_assets(template_id) where template_id is not null;
create index if not exists marketing_assets_command_idx on public.marketing_assets(command_preset_id) where command_preset_id is not null;
create index if not exists marketing_publication_jobs_campaign_idx on public.marketing_publication_jobs(campaign_id) where campaign_id is not null;
create index if not exists marketing_publication_jobs_asset_idx on public.marketing_publication_jobs(asset_id) where asset_id is not null;

commit;
