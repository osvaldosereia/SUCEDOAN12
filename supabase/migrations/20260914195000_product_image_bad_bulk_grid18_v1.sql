-- Bulk regeneration for products in the Admin "Imagens ruins" queue.
-- Explicit admin retries stay on the 18-up medium grid and are prioritized over
-- normal backlog. The published image is kept until a new candidate passes.

create or replace function public.list_product_image_bad_grid18_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with eligible as (
    select p.id,p.updated_at
    from public.products p
    left join public.product_image_jobs j on j.product_id=p.id
    where p.is_active=true
      and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_manual_review_required=true
      and coalesce(p.image_ai_status,'')<>'processing'
      and coalesce(j.status,'')<>'processing'
  )
  select jsonb_build_object(
    'count',count(*),
    'product_ids',coalesce(jsonb_agg(id order by updated_at desc),'[]'::jsonb)
  )
  from eligible;
$$;

create or replace function public.queue_product_image_bad_grid18_v1(
  p_product_ids uuid[] default null,
  p_all_bad boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_queued_ids uuid[];
  v_requested integer:=0;
  v_queued integer:=0;
begin
  if not coalesce(p_all_bad,false)
     and (p_product_ids is null or coalesce(cardinality(p_product_ids),0)=0) then
    return jsonb_build_object('queued',0,'skipped',0,'reason','no_products');
  end if;

  select array_agg(p.id order by p.updated_at desc,p.id),count(*)::integer
    into v_ids,v_requested
  from public.products p
  left join public.product_image_jobs j on j.product_id=p.id
  where p.is_active=true
    and coalesce(p.image_ai_ignored,false)=false
    and p.image_ai_manual_review_required=true
    and coalesce(p.image_ai_status,'')<>'processing'
    and coalesce(j.status,'')<>'processing'
    and (coalesce(p_all_bad,false) or p.id=any(p_product_ids));

  if v_requested=0 then
    return jsonb_build_object('queued',0,'skipped',0,'reason','no_eligible_products');
  end if;

  with upserted as (
    insert into public.product_image_jobs(
      product_id,source_image_url,status,attempts,grid_attempts,force_individual,
      last_batch_id,error_message,started_at,processed_at,updated_at
    )
    select p.id,
           coalesce(nullif(p.image_source_url,''),nullif(p.image_original_url,''),nullif(p.image_url,''),'bulk-grid18-source-resolution-v1'),
           'pending',0,0,false,null,'bulk_retry_bad_images_grid18',null,null,now()
    from public.products p
    where p.id=any(v_ids)
    on conflict(product_id) do update set
      source_image_url=excluded.source_image_url,
      status='pending',attempts=0,grid_attempts=0,force_individual=false,
      last_batch_id=null,error_message='bulk_retry_bad_images_grid18',
      started_at=null,processed_at=null,updated_at=now()
    where public.product_image_jobs.status<>'processing'
    returning product_id
  )
  select array_agg(product_id),count(*)::integer
    into v_queued_ids,v_queued
  from upserted;

  if v_queued>0 then
    update public.products p
       set image_ai_status='pending',
           image_ai_error=null,
           image_ai_pipeline_version=null,
           image_ai_manual_review_required=true,
           image_ai_manual_prompt=null,
           image_ai_manual_requested_at=null,
           image_ai_manual_requested_by=null,
           image_ai_manual_resolved_at=null,
           image_ai_ignored=false,
           image_ai_admin_updated_at=now(),
           updated_at=now()
     where p.id=any(v_queued_ids);
  end if;

  return jsonb_build_object(
    'queued',v_queued,
    'skipped',greatest(v_requested-v_queued,0),
    'requested',v_requested,
    'batches_expected',case when v_queued=0 then 0 else ceil(v_queued/18.0)::integer end
  );
end;
$$;

-- Bad-image retries that were explicitly put back in the grid must win over the
-- ordinary catalog backlog. The final partial group is still padded by the
-- existing filler mechanism, so every generation request remains exactly 18.
create or replace function public.claim_product_image_grid18_batch_v2()
returns table(batch_id uuid, item_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid; v_ids uuid[]; v_fillers uuid[]; v_count integer := 0; v_filler_count integer := 0;
begin
  with stale as (
    select b.id from public.product_image_batches b
    where b.mode='grid_3x6_18' and b.status in ('processing','prepared','generated')
      and b.started_at < now()-interval '35 minutes'
    for update skip locked
  ), affected as (
    update public.product_image_batch_items i set
      status='error',error_message=coalesce(i.error_message,'stale_grid18_v2_batch'),updated_at=now()
    where i.batch_id in (select id from stale) and i.status in ('processing','prepared')
    returning i.job_id,i.is_filler
  )
  update public.product_image_jobs j set
    status='pending',force_individual=false,grid_attempts=0,error_message='stale_grid18_v2_batch',updated_at=now()
  where j.id in (select job_id from affected where is_filler=false) and j.attempts<3;

  update public.product_image_batches b set
    status='error',error_message=coalesce(b.error_message,'stale_grid18_v2_batch'),processed_at=now(),updated_at=now()
  where b.mode='grid_3x6_18' and b.status in ('processing','prepared','generated')
    and b.started_at < now()-interval '35 minutes';

  select array_agg(x.id order by x.manual_review desc,x.featured desc,x.in_stock desc,x.created_at,x.id),count(*)
    into v_ids,v_count
  from (
    select j.id,j.created_at,
           coalesce(p.image_ai_manual_review_required,false) as manual_review,
           coalesce(p.storefront_featured,false) as featured,
           (coalesce(p.stock,0)>0) as in_stock
    from public.product_image_jobs j join public.products p on p.id=j.product_id
    where j.status in ('pending','error') and j.attempts<3 and j.force_individual=false
      and p.is_active=true and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean'
    order by coalesce(p.image_ai_manual_review_required,false) desc,
             p.storefront_featured desc,(coalesce(p.stock,0)>0) desc,j.created_at,j.id
    for update of j skip locked limit 18
  ) x;
  if v_count=0 then return; end if;

  if v_count<18 then
    select array_agg(x.id order by x.processed_at desc,x.id),count(*) into v_fillers,v_filler_count
    from (
      select j.id,j.processed_at
      from public.product_image_jobs j join public.products p on p.id=j.product_id
      where j.status='completed' and j.force_individual=false and p.is_active=true
        and coalesce(p.image_ai_ignored,false)=false
        and p.image_ai_pipeline_version='grid18-studio-v2-medium-clean'
        and not (j.id=any(v_ids))
      order by j.processed_at desc nulls last,j.id
      limit (18-v_count)
    ) x;
    if v_count+coalesce(v_filler_count,0)<>18 then return; end if;
  end if;

  insert into public.product_image_batches(mode,status,model,quality,grid_width,grid_height,grid_rows,grid_cols)
  values('grid_3x6_18','processing','gpt-image-2.5-sunburst','medium',2400,1200,3,6)
  returning id into v_batch;

  with selected as (
    select j.id,j.product_id,j.created_at from public.product_image_jobs j where j.id=any(v_ids)
  ), ranked as (
    select s.id,s.product_id,row_number() over(order by s.created_at,s.id)::integer pos from selected s
  ), locked as (
    update public.product_image_jobs j set
      status='processing',attempts=j.attempts+1,grid_attempts=j.grid_attempts+1,last_batch_id=v_batch,
      started_at=now(),error_message=null,force_individual=false,updated_at=now()
    from ranked r where j.id=r.id returning j.id,j.product_id,r.pos
  )
  insert into public.product_image_batch_items(batch_id,job_id,product_id,position,grid_row,grid_col,status,is_filler)
  select v_batch,l.id,l.product_id,l.pos,((l.pos-1)/6)+1,((l.pos-1)%6)+1,'processing',false
  from locked l order by l.pos;

  if v_count<18 then
    with fillers as (
      select j.id,j.product_id,row_number() over(order by j.processed_at desc nulls last,j.id)::integer rn
      from public.product_image_jobs j where j.id=any(v_fillers)
    )
    insert into public.product_image_batch_items(batch_id,job_id,product_id,position,grid_row,grid_col,status,is_filler)
    select v_batch,f.id,f.product_id,v_count+f.rn,((v_count+f.rn-1)/6)+1,((v_count+f.rn-1)%6)+1,'processing',true
    from fillers f order by f.rn;
  end if;

  update public.products p set image_ai_status='processing',image_ai_error=null,updated_at=now()
  where p.id in (select i.product_id from public.product_image_batch_items i where i.batch_id=v_batch and i.is_filler=false);
  return query select v_batch,18;
end;
$$;

create or replace function public.restart_product_image_grid18_drain_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_jobid bigint;
begin
  insert into private.product_image_runtime_state_v2(id)
  values(true)
  on conflict(id) do update set initial_drain_completed_at=null,updated_at=now();

  begin
    perform cron.unschedule('dona-antonia-product-images-grid18-v2');
  exception when others then null;
  end;

  select cron.schedule(
    'dona-antonia-product-images-grid18-v2',
    '* * * * *',
    'select public.dispatch_product_image_grid18_worker_v2();'
  ) into v_jobid;
  return jsonb_build_object('scheduled',true,'job_id',v_jobid);
end;
$$;

-- A successful strict grid retry resolves the previous manual-review flag.
-- This runs after the older source-inspection trigger because PostgreSQL orders
-- same-kind triggers by name and this trigger is deliberately prefixed "zz".
create or replace function public.product_image_clear_manual_review_after_grid18_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_ai_status='completed'
     and new.image_ai_pipeline_version='grid18-studio-v2-medium-clean'
     and nullif(btrim(new.image_url),'') is not null then
    new.image_ai_manual_review_required:=false;
    new.image_ai_manual_review_reason:=null;
    new.image_ai_manual_prompt:=null;
    new.image_ai_manual_requested_at:=null;
    new.image_ai_manual_requested_by:=null;
    new.image_ai_manual_resolved_at:=now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_product_image_clear_manual_after_grid18_v1 on public.products;
create trigger trg_zz_product_image_clear_manual_after_grid18_v1
before update of image_ai_status,image_ai_pipeline_version,image_url on public.products
for each row execute function public.product_image_clear_manual_review_after_grid18_v1();

revoke all on function public.list_product_image_bad_grid18_v1() from public,anon,authenticated;
revoke all on function public.queue_product_image_bad_grid18_v1(uuid[],boolean) from public,anon,authenticated;
revoke all on function public.restart_product_image_grid18_drain_v1() from public,anon,authenticated;
revoke all on function public.claim_product_image_grid18_batch_v2() from public,anon,authenticated;
revoke all on function public.product_image_clear_manual_review_after_grid18_v1() from public,anon,authenticated;
grant execute on function public.list_product_image_bad_grid18_v1() to service_role,postgres;
grant execute on function public.queue_product_image_bad_grid18_v1(uuid[],boolean) to service_role,postgres;
grant execute on function public.restart_product_image_grid18_drain_v1() to service_role,postgres;
grant execute on function public.claim_product_image_grid18_batch_v2() to service_role,postgres;
