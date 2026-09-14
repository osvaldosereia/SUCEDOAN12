alter table public.service_simple_runtime_config
  add column if not exists config_level text not null default 'recommended',
  add column if not exists integration_flags jsonb not null default '{"openai":true,"baskets":true,"products":true,"offers":true,"checkout":true,"profile":true,"commerce_info":true,"external_links":false}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='service_simple_runtime_config_level_check'
      and conrelid='public.service_simple_runtime_config'::regclass
  ) then
    alter table public.service_simple_runtime_config
      add constraint service_simple_runtime_config_level_check
      check (config_level in ('basic','recommended','complete','custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='service_simple_runtime_config_integration_flags_object_check'
      and conrelid='public.service_simple_runtime_config'::regclass
  ) then
    alter table public.service_simple_runtime_config
      add constraint service_simple_runtime_config_integration_flags_object_check
      check (jsonb_typeof(integration_flags)='object');
  end if;
end $$;

update public.service_simple_runtime_config
set
  config_level=case when config_level in ('basic','recommended','complete','custom') then config_level else 'recommended' end,
  integration_flags=coalesce(integration_flags,'{"openai":true,"baskets":true,"products":true,"offers":true,"checkout":true,"profile":true,"commerce_info":true,"external_links":false}'::jsonb),
  updated_at=now()
where id=1;
