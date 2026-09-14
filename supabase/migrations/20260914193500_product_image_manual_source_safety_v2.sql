-- Manual regeneration source-safety v2.
-- Sources persisted under /sources/grid18/ are original/reference assets, not generated outputs.
-- Generated assets under /openai/ remain forbidden as references.
-- Also allow image_original_url in the manual claim because the worker already fetches it.

create or replace function public.product_image_safe_current_source_v1(p_url text,p_ai_url text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select coalesce(
    p_url is not null
    and length(btrim(p_url))>0
    and (
      p_url ~ '^https://raw\.githubusercontent\.com/osvaldosereia/SUCEDOAN12/'
      or p_url ~ '^https://ssbesxgaijknwsjbsbcz\.supabase\.co/storage/v1/object/public/product-images/'
      or p_url ~ '^https://(www\.)?donaantonia\.com\.br/'
    )
    and p_url not ilike '%/openai/%'
    and (p_ai_url is null or p_ai_url<>p_url)
  ,false);
$$;

revoke all on function public.product_image_safe_current_source_v1(text,text) from public,anon,authenticated;
grant execute on function public.product_image_safe_current_source_v1(text,text) to service_role;

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
        or public.product_image_safe_current_source_v1(p.image_original_url,null)
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
