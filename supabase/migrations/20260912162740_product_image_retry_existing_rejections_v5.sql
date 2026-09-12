with retryable as (
  select j.id as job_id,j.product_id
  from public.product_image_jobs j
  join public.products p on p.id=j.product_id
  where p.image_ai_status='rejected'
    and j.status='rejected'
    and j.attempts<3
    and coalesce(p.image_ai_ignored,false)=false
    and public.product_image_safe_current_source_v1(p.image_source_url,null)
), jobs as (
  update public.product_image_jobs j
     set status='pending',force_individual=true,error_message=coalesce(j.error_message,'automatic_retry_existing_v5'),started_at=null,processed_at=null,updated_at=now()
   where j.id in (select job_id from retryable)
  returning j.product_id
)
update public.products p
   set image_ai_status='pending',updated_at=now()
 where p.id in (select product_id from jobs);
