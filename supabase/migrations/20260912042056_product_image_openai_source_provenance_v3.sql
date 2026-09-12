alter table public.products
  add column if not exists image_source_url text,
  add column if not exists image_source_origin text,
  add column if not exists image_source_width integer,
  add column if not exists image_source_height integer,
  add column if not exists image_source_sha256 text,
  add column if not exists image_source_verified_at timestamptz;

alter table public.product_image_jobs
  add column if not exists source_used_url text,
  add column if not exists source_field text,
  add column if not exists source_width integer,
  add column if not exists source_height integer,
  add column if not exists source_aspect_ratio numeric(10,4),
  add column if not exists source_sha256 text;

alter table public.product_image_jobs drop constraint if exists product_image_jobs_status_check;
alter table public.product_image_jobs add constraint product_image_jobs_status_check
  check (status = any (array['pending'::text,'processing'::text,'completed'::text,'error'::text,'rejected'::text]));

create or replace function public.enqueue_product_image_jobs_v2(p_limit integer default 12)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer:=0;
begin
  with candidates as (
    select p.id, coalesce(nullif(p.image_source_url,''),nullif(p.image_original_url,''),nullif(p.image_url,'')) as trace_url
    from public.products p
    where p.is_active=true
      and coalesce(p.image_ai_attempts,0)<3
      and (p.image_ai_status is null or p.image_ai_status in ('pending','error','needs_reprocess'))
      and (
        nullif(p.image_source_url,'') is not null
        or nullif(p.firebase_key,'') is not null
        or exists (
          select 1 from storage.objects o
          where o.bucket_id='product-images'
            and o.name='catalog-products/'||p.id::text||'.webp'
        )
      )
    order by p.storefront_featured desc, (coalesce(p.stock,0)>0) desc, p.updated_at desc, p.id
    limit greatest(1,least(coalesce(p_limit,12),100))
  ), inserted as (
    insert into public.product_image_jobs(product_id,source_image_url,status)
    select c.id,coalesce(c.trace_url,'source-resolution-v2'),'pending'
    from candidates c
    on conflict(product_id) do update
      set status=case when public.product_image_jobs.status in ('rejected','completed') then public.product_image_jobs.status else 'pending' end,
          updated_at=now()
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$function$;

create or replace function public.claim_product_image_jobs_v2(p_limit integer default 1)
returns table(id uuid, product_id uuid, attempts integer, model text)
language plpgsql
security definer
set search_path=''
as $function$
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
  returning j.id,j.product_id,j.attempts,j.model;
end;
$function$;

revoke all on function public.enqueue_product_image_jobs_v2(integer) from public, anon, authenticated;
revoke all on function public.claim_product_image_jobs_v2(integer) from public, anon, authenticated;
grant execute on function public.enqueue_product_image_jobs_v2(integer) to service_role;
grant execute on function public.claim_product_image_jobs_v2(integer) to service_role;