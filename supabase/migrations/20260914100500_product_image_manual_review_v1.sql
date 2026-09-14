-- Manual review for product images.
-- Automatic production stays grid18/medium. Individual generation is admin-requested only.

alter table public.products
  add column if not exists image_ai_manual_review_required boolean not null default false,
  add column if not exists image_ai_manual_review_reason text,
  add column if not exists image_ai_manual_prompt text,
  add column if not exists image_ai_manual_requested_at timestamptz,
  add column if not exists image_ai_manual_requested_by uuid,
  add column if not exists image_ai_manual_attempts integer not null default 0,
  add column if not exists image_ai_manual_resolved_at timestamptz;

create index if not exists idx_products_image_ai_manual_review_v1
  on public.products (image_ai_manual_review_required, is_active, updated_at desc)
  where image_ai_manual_review_required=true;

-- Whenever the grid intentionally keeps a visually imperfect source, mark it
-- for review from the source-inspection JSON that the worker already persists.
create or replace function public.product_image_source_review_flag_v1()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v jsonb := coalesce(new.image_ai_validation->'source_inspection','{}'::jsonb);
  v_reason text := null;
begin
  if new.is_active is distinct from true then return new; end if;
  if v='{}'::jsonb then return new; end if;

  if coalesce((v->>'bad_crop')::boolean,false) then v_reason:='source_bad_crop';
  elsif coalesce((v->>'bad_cutout')::boolean,false) then v_reason:='source_bad_cutout';
  elsif coalesce((v->>'extra_elements')::boolean,false) then v_reason:='source_extra_elements';
  elsif coalesce((v->>'product_complete')::boolean,true)=false then v_reason:='source_product_incomplete';
  elsif coalesce((v->>'same_product_confidence')::numeric,1)<0.92 then v_reason:='source_identity_low';
  elsif coalesce((v->>'source_quality_score')::numeric,1)<0.80 then v_reason:='source_quality_low';
  elsif coalesce((v->>'front_or_usable_view')::boolean,true)=false then v_reason:='source_view_poor';
  end if;

  if v_reason is not null then
    new.image_ai_manual_review_required:=true;
    new.image_ai_manual_review_reason:=coalesce(nullif(v->>'critical_issue',''),v_reason);
    new.image_ai_manual_resolved_at:=null;
  end if;
  return new;
exception when others then
  -- Review metadata must never break image production.
  return new;
end;
$$;

drop trigger if exists trg_product_image_source_review_flag_v1 on public.products;
create trigger trg_product_image_source_review_flag_v1
before update of image_ai_validation,is_active on public.products
for each row execute function public.product_image_source_review_flag_v1();

-- Legacy automatic fallbacks become manual-review items instead of silently
-- spending on one-by-one generation.
update public.products p
set image_ai_manual_review_required=true,
    image_ai_manual_review_reason=coalesce(nullif(p.image_ai_error,''),'legacy_auto_individual_fallback'),
    image_ai_manual_resolved_at=null,
    updated_at=now()
from public.product_image_jobs j
where j.product_id=p.id
  and j.force_individual=true
  and j.status in ('pending','error')
  and p.is_active=true;

update public.product_image_jobs j
set status='rejected',
    force_individual=false,
    error_message=coalesce(nullif(j.error_message,''),'manual_review_required:legacy_auto_individual_fallback'),
    processed_at=coalesce(j.processed_at,now()),
    updated_at=now()
from public.products p
where p.id=j.product_id
  and j.force_individual=true
  and j.status in ('pending','error')
  and p.image_ai_manual_requested_at is null;

-- Individual claims are only for an explicit manual request on an active product.
create or replace function public.claim_product_image_fallback_v1(p_limit integer default 1)
returns table(id uuid, product_id uuid, attempts integer, model text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  with picked as (
    select j.id
    from public.product_image_jobs j
    join public.products p on p.id=j.product_id
    where j.status in ('pending','error')
      and j.attempts<3
      and j.force_individual=true
      and p.is_active=true
      and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_manual_review_required=true
      and p.image_ai_manual_requested_at is not null
      and nullif(btrim(p.image_ai_manual_prompt),'') is not null
      and (
        public.product_image_safe_current_source_v1(p.image_source_url,null)
        or public.product_image_safe_current_source_v1(p.image_url,p.image_ai_url)
        or exists (
          select 1 from storage.objects o
          where o.bucket_id='product-images'
            and o.name='catalog-products/'||p.id::text||'.webp'
        )
      )
    order by p.image_ai_manual_requested_at,j.created_at,j.id
    for update of j skip locked
    limit greatest(1,least(coalesce(p_limit,1),3))
  )
  update public.product_image_jobs j
     set status='processing',attempts=j.attempts+1,started_at=now(),error_message=null,updated_at=now()
    from picked
   where j.id=picked.id
  returning j.id,j.product_id,j.attempts,j.model;
end;
$$;

revoke all on function public.claim_product_image_fallback_v1(integer) from public;
revoke all on function public.claim_product_image_fallback_v1(integer) from anon;
revoke all on function public.claim_product_image_fallback_v1(integer) from authenticated;
grant execute on function public.claim_product_image_fallback_v1(integer) to service_role, postgres;

-- Rejected automatic results are flagged for human review. This trigger no
-- longer creates an automatic individual retry.
create or replace function public.product_image_auto_retry_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.image_ai_status not in ('rejected','source_rejected') then return new; end if;
  if not coalesce(new.is_active,false) or coalesce(new.image_ai_ignored,false) then return new; end if;

  update public.products
     set image_ai_manual_review_required=true,
         image_ai_manual_review_reason=coalesce(nullif(new.image_ai_error,''),new.image_ai_status),
         image_ai_manual_resolved_at=null,
         updated_at=now()
   where id=new.id;

  -- Only neutralize non-manual legacy fallback state. An explicit admin
  -- request has image_ai_manual_requested_at populated and is left intact.
  if new.image_ai_manual_requested_at is null then
    update public.product_image_jobs
       set force_individual=false,
           status=case when status in ('pending','error') then 'rejected' else status end,
           error_message=coalesce(nullif(error_message,''),'manual_review_required'),
           processed_at=case when status in ('pending','error') then coalesce(processed_at,now()) else processed_at end,
           updated_at=now()
     where product_id=new.id
       and force_individual=true;
  end if;
  return new;
end;
$$;

revoke all on function public.product_image_auto_retry_v1() from public;
revoke all on function public.product_image_auto_retry_v1() from anon;
revoke all on function public.product_image_auto_retry_v1() from authenticated;
grant execute on function public.product_image_auto_retry_v1() to service_role, postgres;

-- Explicit manual dispatcher. No cron is created: this is invoked only by Admin.
create or replace function public.dispatch_product_image_manual_worker_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
  v_pending bigint:=0;
  v_request bigint;
begin
  select count(*) into v_pending
  from public.product_image_jobs j
  join public.products p on p.id=j.product_id
  where j.status in ('pending','error')
    and j.attempts<3
    and j.force_individual=true
    and p.is_active=true
    and coalesce(p.image_ai_ignored,false)=false
    and p.image_ai_manual_review_required=true
    and p.image_ai_manual_requested_at is not null
    and nullif(btrim(p.image_ai_manual_prompt),'') is not null;

  if v_pending=0 then
    return jsonb_build_object('dispatched',false,'reason','manual_queue_empty');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc
  limit 1;

  if v_secret is null then
    return jsonb_build_object('dispatched',false,'reason','worker_secret_missing');
  end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-manual-v1',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-da-product-image-key',v_secret
    ),
    body:=jsonb_build_object('event','drain_manual','limit',1),
    timeout_milliseconds:=120000
  );

  return jsonb_build_object('dispatched',true,'request_id',v_request,'pending',v_pending,'event','drain_manual');
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed','detail',left(sqlerrm,180));
end;
$$;

revoke all on function public.dispatch_product_image_manual_worker_v1() from public;
revoke all on function public.dispatch_product_image_manual_worker_v1() from anon;
revoke all on function public.dispatch_product_image_manual_worker_v1() from authenticated;
grant execute on function public.dispatch_product_image_manual_worker_v1() to service_role, postgres;
