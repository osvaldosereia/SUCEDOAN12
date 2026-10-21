-- Enriches only newly-created XML catalog records. Never publishes or changes stock/fiscal data.
create table if not exists public.product_catalog_enrichment_jobs_v1 (
  product_id uuid primary key references public.products(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','review','skipped','error')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  review_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists product_catalog_enrichment_jobs_pending_v1_idx
  on public.product_catalog_enrichment_jobs_v1(status, available_at, created_at);
alter table public.product_catalog_enrichment_jobs_v1 enable row level security;
revoke all on public.product_catalog_enrichment_jobs_v1 from public, anon, authenticated;
grant all on public.product_catalog_enrichment_jobs_v1 to service_role;

create or replace function public.product_catalog_enrichment_worker_authorized_v1(p_secret text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce(
    length(coalesce(p_secret,'')) >= 48
    and p_secret = (select decrypted_secret from vault.decrypted_secrets where name='product_catalog_enrichment_worker_secret_v1' limit 1),
    false
  )
$$;
revoke all on function public.product_catalog_enrichment_worker_authorized_v1(text) from public, anon, authenticated;
grant execute on function public.product_catalog_enrichment_worker_authorized_v1(text) to service_role;

create or replace function public.get_product_catalog_enrichment_openai_key_v1()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name='openai_conversation_worker_key_v1' limit 1
$$;
revoke all on function public.get_product_catalog_enrichment_openai_key_v1() from public, anon, authenticated;
grant execute on function public.get_product_catalog_enrichment_openai_key_v1() to service_role;

create or replace function public.claim_product_catalog_enrichment_jobs_v1(p_limit integer default 5)
returns table(product_id uuid, attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select j.product_id
    from public.product_catalog_enrichment_jobs_v1 j
    where (j.status='pending' and j.available_at <= now())
       or (j.status='processing' and j.locked_at < now() - interval '15 minutes')
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,5),5))
  ), claimed as (
    update public.product_catalog_enrichment_jobs_v1 j
    set status='processing', attempts=j.attempts+1, locked_at=now(), updated_at=now(), last_error=null
    from candidates c
    where j.product_id=c.product_id
    returning j.product_id, j.attempts
  )
  select c.product_id, c.attempts from claimed c;
end
$$;
revoke all on function public.claim_product_catalog_enrichment_jobs_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_product_catalog_enrichment_jobs_v1(integer) to service_role;

create or replace function public.mark_new_xml_product_for_catalog_enrichment_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.metadata->>'purchase_xml_created','false')='true' then
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('ean_reader_segment_visible',true);
  end if;
  return new;
end
$$;
drop trigger if exists products_mark_xml_catalog_enrichment_v1 on public.products;
create trigger products_mark_xml_catalog_enrichment_v1
before insert on public.products
for each row execute function public.mark_new_xml_product_for_catalog_enrichment_v1();

create or replace function public.enqueue_new_xml_product_catalog_enrichment_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.metadata->>'purchase_xml_created','false')='true'
     and coalesce(new.metadata->>'new_product_review_required','false')='true' then
    insert into public.product_catalog_enrichment_jobs_v1(product_id)
    values (new.id) on conflict (product_id) do nothing;
  end if;
  return new;
end
$$;
drop trigger if exists products_enqueue_xml_catalog_enrichment_v1 on public.products;
create trigger products_enqueue_xml_catalog_enrichment_v1
after insert on public.products
for each row execute function public.enqueue_new_xml_product_catalog_enrichment_v1();

-- Include existing XML-created drafts once, without touching their product fields.
update public.products p
set metadata = coalesce(p.metadata,'{}'::jsonb) || jsonb_build_object('ean_reader_segment_visible',true)
where coalesce(p.metadata->>'purchase_xml_created','false')='true'
  and coalesce(p.metadata->>'new_product_review_required','false')='true'
  and coalesce(p.metadata->>'catalog_enrichment_status','')='';

insert into public.product_catalog_enrichment_jobs_v1(product_id)
select p.id
from public.products p
where coalesce(p.metadata->>'purchase_xml_created','false')='true'
  and coalesce(p.metadata->>'new_product_review_required','false')='true'
  and coalesce(p.metadata->>'catalog_enrichment_status','')=''
on conflict (product_id) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name='product_catalog_enrichment_worker_secret_v1') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
      'product_catalog_enrichment_worker_secret_v1',
      'Authorization secret for the scheduled XML product catalog enrichment worker'
    );
  end if;
  if not exists (select 1 from vault.secrets where name='product_catalog_enrichment_project_url_v1') then
    perform vault.create_secret(
      (select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_project_url_v1' limit 1),
      'product_catalog_enrichment_project_url_v1',
      'Supabase project URL for the XML product catalog enrichment worker'
    );
  end if;
  if not exists (select 1 from vault.secrets where name='product_catalog_enrichment_publishable_key_v1') then
    perform vault.create_secret(
      (select decrypted_secret from vault.decrypted_secrets where name='oscb_catalog_publishable_key_v1' limit 1),
      'product_catalog_enrichment_publishable_key_v1',
      'Publishable key for the scheduled XML product catalog enrichment worker'
    );
  end if;
end
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname='product-catalog-enrichment-v1') then
    perform cron.unschedule('product-catalog-enrichment-v1');
  end if;
  perform cron.schedule(
    'product-catalog-enrichment-v1',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url:=(select decrypted_secret from vault.decrypted_secrets where name='product_catalog_enrichment_project_url_v1')||'/functions/v1/product-catalog-enrichment-v1',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'apikey',(select decrypted_secret from vault.decrypted_secrets where name='product_catalog_enrichment_publishable_key_v1'),
          'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='product_catalog_enrichment_publishable_key_v1'),
          'x-product-catalog-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='product_catalog_enrichment_worker_secret_v1')
        ),
        body:='{"limit":5}'::jsonb,
        timeout_milliseconds:=120000
      );
    $job$
  );
end
$$;
