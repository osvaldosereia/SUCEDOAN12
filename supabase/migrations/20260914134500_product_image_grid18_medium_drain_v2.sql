-- Final one-shot product image drain: 18-up grid, medium quality, Firebase active only.
-- Stops its own cron when all eligible products have been processed.

alter table private.product_image_runtime_state_v2
  add column if not exists lock_token uuid,
  add column if not exists lock_until timestamptz;

create or replace function public.try_acquire_product_image_worker_v2()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_token uuid := gen_random_uuid();
  v_acquired uuid;
begin
  insert into private.product_image_runtime_state_v2(id)
  values(true)
  on conflict (id) do nothing;

  update private.product_image_runtime_state_v2
     set lock_token = v_new_token,
         lock_until = now() + interval '4 minutes',
         updated_at = now()
   where id = true
     and (lock_token is null or lock_until is null or lock_until < now())
  returning lock_token into v_acquired;

  return v_acquired;
end;
$$;

create or replace function public.release_product_image_worker_v2(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.product_image_runtime_state_v2
     set lock_token = null,
         lock_until = null,
         updated_at = now()
   where id = true
     and lock_token = p_token;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.try_acquire_product_image_worker_v2() from public;
revoke all on function public.release_product_image_worker_v2(uuid) from public;
grant execute on function public.try_acquire_product_image_worker_v2() to service_role, postgres;
grant execute on function public.release_product_image_worker_v2(uuid) to service_role, postgres;

create or replace function public.sync_product_image_firebase_v2(p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_id uuid; v_active boolean; v_source text; v_key text;
  v_old_active boolean; v_old_source text; v_old_pipeline text;
  v_source_changed boolean; v_count integer := 0;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'p_changes_must_be_array';
  end if;
  for r in select value from jsonb_array_elements(p_changes) loop
    begin v_id := (r->>'id')::uuid; exception when others then continue; end;
    v_active := coalesce((r->>'active')::boolean,false);
    v_source := nullif(btrim(r->>'source_url'),'');
    v_key := nullif(btrim(r->>'firebase_key'),'');
    select p.is_active,p.image_firebase_source_url,p.image_ai_pipeline_version
      into v_old_active,v_old_source,v_old_pipeline
      from public.products p where p.id=v_id for update;
    if not found then continue; end if;
    v_source_changed := v_old_source is distinct from v_source;
    update public.products p set
      firebase_key=coalesce(v_key,p.firebase_key),
      is_active=v_active,
      image_firebase_source_url=v_source,
      image_ai_status=case
        when not v_active then case when p.image_ai_status='processing' then 'error' else p.image_ai_status end
        when v_source_changed or p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean' then 'needs_reprocess'
        else p.image_ai_status end,
      image_ai_pipeline_version=case when v_active and v_source_changed then null else p.image_ai_pipeline_version end,
      image_ai_error=case
        when not v_active then 'firebase_inactive'
        when v_active and (v_source_changed or p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean') then null
        else p.image_ai_error end,
      updated_at=now()
    where p.id=v_id;
    if not v_active then
      update public.product_image_jobs j set
        status=case when j.status='completed' then j.status else 'rejected' end,
        force_individual=false,
        error_message=case when j.status='completed' then j.error_message else 'firebase_inactive' end,
        updated_at=now()
      where j.product_id=v_id;
    elsif v_source_changed or coalesce(v_old_active,false)=false then
      update public.product_image_jobs j set
        status=case when v_old_pipeline='grid18-studio-v2-medium-clean' and not v_source_changed then j.status else 'pending' end,
        attempts=case when v_source_changed or v_old_pipeline is distinct from 'grid18-studio-v2-medium-clean' then 0 else j.attempts end,
        grid_attempts=0,force_individual=false,last_batch_id=null,error_message=null,started_at=null,
        processed_at=case when v_source_changed or v_old_pipeline is distinct from 'grid18-studio-v2-medium-clean' then null else j.processed_at end,
        updated_at=now()
      where j.product_id=v_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.enqueue_product_image_jobs_v3(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_updated integer := 0; v_inserted integer := 0;
begin
  with reset as (
    update public.product_image_jobs j set
      status='pending',attempts=0,grid_attempts=0,force_individual=false,last_batch_id=null,
      error_message=null,started_at=null,processed_at=null,updated_at=now()
    from public.products p
    where p.id=j.product_id and p.is_active=true and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean'
      and p.image_ai_status='needs_reprocess' and j.status='completed'
    returning 1
  ) select count(*) into v_updated from reset;

  with candidates as (
    select p.id,coalesce(nullif(p.image_source_url,''),nullif(p.image_original_url,''),nullif(p.image_url,''),'source-resolution-v2') as trace_url
    from public.products p
    left join public.product_image_jobs j on j.product_id=p.id
    where p.is_active=true and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean'
      and j.id is null
    order by p.storefront_featured desc,(coalesce(p.stock,0)>0) desc,p.updated_at desc,p.id
    limit greatest(1,least(coalesce(p_limit,200),500))
  ), ins as (
    insert into public.product_image_jobs(product_id,source_image_url,status,attempts,grid_attempts,force_individual)
    select c.id,c.trace_url,'pending',0,0,false from candidates c
    on conflict(product_id) do nothing returning 1
  ) select count(*) into v_inserted from ins;
  return v_updated+v_inserted;
end;
$$;

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

  select array_agg(x.id order by x.created_at,x.id),count(*) into v_ids,v_count
  from (
    select j.id,j.created_at
    from public.product_image_jobs j join public.products p on p.id=j.product_id
    where j.status in ('pending','error') and j.attempts<3 and j.force_individual=false
      and p.is_active=true and coalesce(p.image_ai_ignored,false)=false
      and p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean'
    order by p.storefront_featured desc,(coalesce(p.stock,0)>0) desc,j.created_at,j.id
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

create or replace function public.dispatch_product_image_grid18_worker_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text; v_request bigint; v_event text; v_active bigint := 0; v_ready bigint := 0;
  v_enqueued integer := 0; v_state private.product_image_runtime_state_v2%rowtype; v_stopped boolean := false;
begin
  select * into v_state from private.product_image_runtime_state_v2 where id=true for update;
  if not found then
    insert into private.product_image_runtime_state_v2(id) values(true) returning * into v_state;
  end if;

  if v_state.initial_sync_dispatched_at is null then
    v_event := 'maintenance';
    update private.product_image_runtime_state_v2
      set initial_sync_dispatched_at=now(),initial_drain_completed_at=null,last_maintenance_at=null,updated_at=now()
      where id=true;
  else
    select public.enqueue_product_image_jobs_v3(500) into v_enqueued;
    select count(*) into v_active
      from public.product_image_batches b
      where b.mode='grid_3x6_18' and b.status in ('processing','prepared','generated');
    select count(*) into v_ready
      from public.product_image_jobs j join public.products p on p.id=j.product_id
      where j.status in ('pending','error') and j.attempts<3 and j.force_individual=false
        and p.is_active=true and coalesce(p.image_ai_ignored,false)=false
        and p.image_ai_pipeline_version is distinct from 'grid18-studio-v2-medium-clean';
    if v_active>0 or v_ready>0 then
      v_event := 'advance';
    else
      update private.product_image_runtime_state_v2
        set initial_drain_completed_at=coalesce(initial_drain_completed_at,now()),updated_at=now()
        where id=true;
      begin
        perform cron.unschedule('dona-antonia-product-images-grid18-v2');
        v_stopped := true;
      exception when others then
        v_stopped := false;
      end;
      return jsonb_build_object('dispatched',false,'reason','drain_complete','cron_stopped',v_stopped,
        'active_batches',v_active,'ready',v_ready,'enqueued',v_enqueued,'pipeline_version','grid18-studio-v2-medium-clean');
    end if;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name='product_image_worker_webhook_key_v1'
    order by created_at desc limit 1;
  if v_secret is null then return jsonb_build_object('dispatched',false,'reason','worker_secret_missing'); end if;

  v_request := net.http_post(
    url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-grid18-v1',
    headers := jsonb_build_object('Content-Type','application/json','x-da-product-image-key',v_secret),
    body := jsonb_build_object('event',v_event),
    timeout_milliseconds := 120000
  );
  return jsonb_build_object('dispatched',true,'event',v_event,'request_id',v_request,
    'active_batches',v_active,'ready',v_ready,'enqueued',v_enqueued,'pipeline_version','grid18-studio-v2-medium-clean');
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed','detail',left(sqlerrm,180));
end;
$$;

-- Reset only the runtime state for this drain. Existing published images are not deleted.
update private.product_image_runtime_state_v2
set initial_sync_dispatched_at=null,
    initial_drain_completed_at=null,
    last_maintenance_at=null,
    lock_token=null,
    lock_until=null,
    updated_at=now()
where id=true;

-- Remove any previous job with the same name and start the one-shot drain every minute.
do $$
begin
  perform cron.unschedule('dona-antonia-product-images-grid18-v2');
exception when others then null;
end $$;

select cron.schedule(
  'dona-antonia-product-images-grid18-v2',
  '* * * * *',
  $cron$select public.dispatch_product_image_grid18_worker_v2();$cron$
);
