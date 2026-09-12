alter table public.products
  add column if not exists image_original_url text,
  add column if not exists image_ai_url text,
  add column if not exists image_ai_status text,
  add column if not exists image_ai_model text,
  add column if not exists image_ai_processed_at timestamptz,
  add column if not exists image_ai_attempts integer not null default 0,
  add column if not exists image_ai_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='products_image_ai_status_check'
      and conrelid='public.products'::regclass
  ) then
    alter table public.products
      add constraint products_image_ai_status_check
      check (image_ai_status is null or image_ai_status in ('pending','processing','completed','error'));
  end if;
end $$;

create table if not exists public.product_image_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_image_url text not null,
  source_original_url text,
  source_origin text,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','error')),
  attempts integer not null default 0,
  model text not null default 'gpt-image-2.5-sunburst',
  output_storage_path text,
  output_url text,
  openai_usage jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id)
);

create index if not exists product_image_jobs_status_created_idx
  on public.product_image_jobs(status, created_at);

alter table public.product_image_jobs enable row level security;
revoke all on table public.product_image_jobs from anon, authenticated;

create or replace function public.enqueue_product_image_jobs_v1(p_limit integer default 12)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer:=0;
begin
  with candidates as (
    select p.id,p.image_url
    from public.products p
    where p.is_active=true
      and p.image_url is not null
      and btrim(p.image_url)<>''
      and coalesce(p.image_ai_attempts,0)<3
      and (p.image_ai_status is null or p.image_ai_status in ('pending','error'))
      and p.image_url not like '%/storage/v1/object/public/product-images/openai/v1/%'
    order by p.storefront_featured desc, (coalesce(p.stock,0)>0) desc, p.updated_at desc, p.id
    limit greatest(1,least(coalesce(p_limit,12),100))
  ), inserted as (
    insert into public.product_image_jobs(product_id,source_image_url,status)
    select c.id,c.image_url,'pending'
    from candidates c
    on conflict(product_id) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

revoke all on function public.enqueue_product_image_jobs_v1(integer) from public, anon, authenticated;
grant execute on function public.enqueue_product_image_jobs_v1(integer) to service_role;

create or replace function public.claim_product_image_jobs_v1(p_limit integer default 1)
returns table(id uuid,product_id uuid,source_image_url text,attempts integer,model text)
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.product_image_jobs
     set status='error',
         error_message=coalesce(error_message,'stale_processing_recovered'),
         updated_at=now()
   where status='processing'
     and started_at < now()-interval '20 minutes';

  return query
  with picked as (
    select j.id
    from public.product_image_jobs j
    where j.status in ('pending','error')
      and j.attempts<3
    order by case when j.status='pending' then 0 else 1 end, j.created_at, j.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),3))
  )
  update public.product_image_jobs j
     set status='processing',
         attempts=j.attempts+1,
         started_at=now(),
         updated_at=now(),
         error_message=null
    from picked
   where j.id=picked.id
  returning j.id,j.product_id,j.source_image_url,j.attempts,j.model;
end;
$$;

revoke all on function public.claim_product_image_jobs_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_product_image_jobs_v1(integer) to service_role;

do $$
declare
  v_secret text;
  v_id uuid;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc limit 1;

  if v_secret is null then
    v_secret:=encode(gen_random_bytes(32),'hex');
    v_id:=vault.create_secret(v_secret,'product_image_worker_webhook_key_v1','Internal webhook key for Dona Antonia OpenAI product image worker');
  end if;

  insert into public.system_secrets(key_name,key_hash,is_active,rotated_at)
  values('product_image_worker_webhook_v1',encode(extensions.digest(v_secret,'sha256'),'hex'),true,now())
  on conflict(key_name) do update
    set key_hash=excluded.key_hash,is_active=true,rotated_at=now();
end $$;

create or replace function public.dispatch_product_image_worker_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_pending bigint:=0;
  v_request bigint;
  v_enqueued integer:=0;
begin
  select public.enqueue_product_image_jobs_v1(12) into v_enqueued;

  select count(*) into v_pending
  from public.product_image_jobs
  where status in ('pending','error') and attempts<3;

  if v_pending=0 then
    return jsonb_build_object('dispatched',false,'reason','queue_empty','enqueued',v_enqueued);
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc limit 1;

  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-product-image-key',v_secret),
    body:=jsonb_build_object('event','drain','limit',1,'dry_run',false),
    timeout_milliseconds:=120000
  );

  return jsonb_build_object('dispatched',true,'request_id',v_request,'pending',v_pending,'enqueued',v_enqueued);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$$;

revoke all on function public.dispatch_product_image_worker_v1() from public, anon, authenticated;
grant execute on function public.dispatch_product_image_worker_v1() to service_role;