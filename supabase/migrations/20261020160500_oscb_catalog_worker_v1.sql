-- OSCBR catalog automation: worker state, private auth gate, Vault configuration and schedule.
-- This migration intentionally stores only the provider username/password as Supabase Edge secrets;
-- worker invocation and public routing credentials are kept in Supabase Vault.
create table if not exists public.oscb_product_research_v1 (
  product_id uuid primary key references public.products(id) on delete cascade,
  gtin text not null check (gtin ~ '^[0-9]{8,14}$'),
  status text not null check (status in ('researching','review','not_found','error','skipped')),
  proposal jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  last_http_status integer,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  attempted_at timestamptz,
  researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.oscb_product_research_v1 enable row level security;
revoke all on public.oscb_product_research_v1 from public, anon, authenticated;
grant all on public.oscb_product_research_v1 to service_role;

create or replace function public.oscb_catalog_worker_authorized_v1(p_secret text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce(
    length(coalesce(p_secret,'')) >= 48
    and p_secret = (select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_worker_secret_v1' limit 1),
    false
  )
$$;
revoke all on function public.oscb_catalog_worker_authorized_v1(text) from public, anon, authenticated;
grant execute on function public.oscb_catalog_worker_authorized_v1(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name='oscb_catalog_worker_secret_v1') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
      'oscb_catalog_worker_secret_v1',
      'Authorization secret for scheduled OSCBR catalog worker'
    );
  end if;
  if not exists (select 1 from vault.secrets where name='oscb_catalog_project_url_v1') then
    perform vault.create_secret(
      'https://ssbesxgaijknwsjbsbcz.supabase.co',
      'oscb_catalog_project_url_v1',
      'Supabase project URL for scheduled OSCBR catalog worker'
    );
  end if;
  if not exists (select 1 from vault.secrets where name='oscb_catalog_publishable_key_v1') then
    perform vault.create_secret(
      'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
      'oscb_catalog_publishable_key_v1',
      'Publishable key for scheduled OSCBR catalog worker'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname='oscb-catalog-worker-v1') then
    perform cron.schedule(
      'oscb-catalog-worker-v1',
      '*/30 * * * *',
      $job$
      select net.http_post(
        url:=(select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_project_url_v1')||'/functions/v1/oscb-catalog-worker-v1',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'apikey',(select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_publishable_key_v1'),
          'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_publishable_key_v1'),
          'x-oscb-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_worker_secret_v1')
        ),
        body:='{}'::jsonb,
        timeout_milliseconds:=120000
      );
      $job$
    );
  end if;
end
$$;
