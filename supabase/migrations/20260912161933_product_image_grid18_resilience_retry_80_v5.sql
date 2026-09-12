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
    and p_url not ilike '%/grid18/%'
    and p_url not ilike '%/fallback-final/%'
    and (p_ai_url is null or p_ai_url<>p_url)
  ,false);
$$;
revoke all on function public.product_image_safe_current_source_v1(text,text) from public,anon,authenticated;
grant execute on function public.product_image_safe_current_source_v1(text,text) to service_role;

update public.products p
set image_source_url=p.image_url,
    image_source_origin='auto_current_catalog_recovery_v5',
    image_source_verified_at=null,
    image_source_sha256=null,
    image_source_width=null,
    image_source_height=null,
    updated_at=now()
where coalesce(p.image_ai_ignored,false)=false
  and public.product_image_safe_current_source_v1(p.image_url,p.image_ai_url)
  and not public.product_image_safe_current_source_v1(p.image_source_url,null);

create or replace function public.enqueue_product_image_jobs_v2(p_limit integer default 12)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer:=0;
begin
  update public.products p
     set image_source_url=p.image_url,
         image_source_origin='auto_current_catalog_v5',
         image_source_verified_at=null,
         image_source_sha256=null,
         image_source_width=null,
         image_source_height=null,
         updated_at=now()
   where p.is_active=true
     and coalesce(p.image_ai_ignored,false)=false
     and (p.image_ai_status is null or p.image_ai_status in ('pending','error','needs_reprocess'))
     and public.product_image_safe_current_source_v1(p.image_url,p.image_ai_url)
     and not public.product_image_safe_current_source_v1(p.image_source_url,null);

  with candidates as (
    select p.id,
           coalesce(nullif(p.image_source_url,''),nullif(p.image_original_url,''),nullif(p.image_url,'')) as trace_url
    from public.products p
    where p.is_active=true
      and coalesce(p.image_ai_ignored,false)=false
      and coalesce(p.image_ai_attempts,0)<3
      and (p.image_ai_status is null or p.image_ai_status in ('pending','error','needs_reprocess'))
      and (
        public.product_image_safe_current_source_v1(p.image_source_url,null)
        or exists (
          select 1 from storage.objects o
          where o.bucket_id='product-images'
            and o.name='catalog-products/'||p.id::text||'.webp'
        )
      )
    order by p.storefront_featured desc,(coalesce(p.stock,0)>0) desc,p.updated_at desc,p.id
    limit greatest(1,least(coalesce(p_limit,12),100))
  ), inserted as (
    insert into public.product_image_jobs(product_id,source_image_url,status)
    select c.id,coalesce(c.trace_url,'source-resolution-v5'),'pending'
    from candidates c
    on conflict(product_id) do update
      set status=case when public.product_image_jobs.status in ('rejected','completed','processing') then public.product_image_jobs.status else 'pending' end,
          source_image_url=case when public.product_image_jobs.status='completed' then public.product_image_jobs.source_image_url else excluded.source_image_url end,
          updated_at=now()
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

create or replace function public.claim_product_image_grid18_batch_v1()
returns table(batch_id uuid,item_count integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer:=0;
  v_batch uuid;
  v_ids uuid[];
begin
  with stale as (
    select b.id
    from public.product_image_batches b
    where b.mode='grid_3x6_18'
      and b.status in ('processing','prepared','generated')
      and b.started_at < now()-interval '30 minutes'
    for update skip locked
  ), affected as (
    update public.product_image_batch_items i
       set status='fallback',error_message=coalesce(i.error_message,'stale_grid18_batch'),updated_at=now()
     where i.batch_id in (select id from stale)
       and i.status in ('processing','prepared')
    returning i.job_id
  ), jobs as (
    update public.product_image_jobs j
       set status='pending',force_individual=true,error_message=coalesce(j.error_message,'stale_grid18_batch'),updated_at=now()
     where j.id in (select job_id from affected)
    returning j.id
  )
  update public.product_image_batches b
     set status='error',error_message=coalesce(b.error_message,'stale_grid18_batch'),processed_at=now(),updated_at=now()
   where b.id in (select id from stale);

  select array_agg(x.id order by x.created_at,x.id),count(*)
    into v_ids,v_count
  from (
    select j.id,j.created_at
    from public.product_image_jobs j
    join public.products p on p.id=j.product_id
    where j.status in ('pending','error')
      and j.attempts<3
      and j.force_individual=false
      and j.grid_attempts<1
      and coalesce(p.image_ai_ignored,false)=false
      and (
        public.product_image_safe_current_source_v1(p.image_source_url,null)
        or exists (
          select 1 from storage.objects o
          where o.bucket_id='product-images'
            and o.name='catalog-products/'||p.id::text||'.webp'
        )
      )
    order by j.created_at,j.id
    for update of j skip locked
    limit 18
  ) x;

  if v_count<>18 then return; end if;

  insert into public.product_image_batches(mode,status,model,quality,grid_width,grid_height,grid_rows,grid_cols)
  values('grid_3x6_18','processing','gpt-image-2.5-sunburst','medium',2400,1200,3,6)
  returning id into v_batch;

  with selected as (
    select j.id,j.product_id,j.created_at from public.product_image_jobs j where j.id=any(v_ids)
  ), ranked as (
    select s.id,s.product_id,row_number() over(order by s.created_at,s.id)::integer pos from selected s
  ), locked as (
    update public.product_image_jobs j
       set status='processing',attempts=j.attempts+1,grid_attempts=j.grid_attempts+1,last_batch_id=v_batch,
           started_at=now(),error_message=null,updated_at=now()
      from ranked r where j.id=r.id
    returning j.id,j.product_id,r.pos
  )
  insert into public.product_image_batch_items(batch_id,job_id,product_id,position,grid_row,grid_col,status)
  select v_batch,l.id,l.product_id,l.pos,((l.pos-1)/6)+1,((l.pos-1)%6)+1,'processing'
  from locked l order by l.pos;

  update public.products p
     set image_ai_status='processing',image_ai_error=null,updated_at=now()
   where p.id in (select i.product_id from public.product_image_batch_items i where i.batch_id=v_batch);

  return query select v_batch,18;
end;
$$;

create or replace function public.claim_product_image_fallback_v1(p_limit integer default 1)
returns table(id uuid,product_id uuid,attempts integer,model text)
language plpgsql
security definer
set search_path=''
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
      and coalesce(p.image_ai_ignored,false)=false
      and (
        public.product_image_safe_current_source_v1(p.image_source_url,null)
        or exists (
          select 1 from storage.objects o
          where o.bucket_id='product-images'
            and o.name='catalog-products/'||p.id::text||'.webp'
        )
      )
    order by j.created_at,j.id
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

create or replace function public.product_image_auto_retry_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.product_image_jobs%rowtype;
begin
  if coalesce(new.image_ai_ignored,false) then return new; end if;
  if new.image_ai_status not in ('rejected','source_rejected') then return new; end if;

  select * into v_job
  from public.product_image_jobs j
  where j.product_id=new.id;
  if not found or v_job.attempts>=3 then return new; end if;

  if new.image_ai_status='source_rejected' then
    if public.product_image_safe_current_source_v1(new.image_url,new.image_ai_url) then
      update public.product_image_jobs
         set status='pending',force_individual=false,grid_attempts=0,last_batch_id=null,error_message=null,started_at=null,processed_at=null,updated_at=now()
       where id=v_job.id;
      update public.products
         set image_source_url=new.image_url,image_source_origin='auto_retry_current_catalog_v5',image_source_verified_at=null,
             image_source_sha256=null,image_source_width=null,image_source_height=null,
             image_ai_status='pending',image_ai_error=null,updated_at=now()
       where id=new.id;
    end if;
    return new;
  end if;

  update public.product_image_jobs
     set status='pending',force_individual=true,error_message=coalesce(error_message,'automatic_retry'),started_at=null,processed_at=null,updated_at=now()
   where id=v_job.id;
  update public.products
     set image_ai_status='pending',updated_at=now()
   where id=new.id;
  return new;
end;
$$;

drop trigger if exists trg_product_image_auto_retry_v1 on public.products;
create trigger trg_product_image_auto_retry_v1
after update of image_ai_status on public.products
for each row
when (new.image_ai_status in ('rejected','source_rejected'))
execute function public.product_image_auto_retry_v1();

create or replace function public.recover_product_image_fallback_stalls_v1()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0;
begin
  with stalled as (
    select j.id,j.product_id,j.attempts
    from public.product_image_jobs j
    join public.products p on p.id=j.product_id
    where j.status='processing'
      and j.force_individual=true
      and coalesce(p.image_ai_ignored,false)=false
      and j.started_at < now()-interval '6 minutes'
    for update of j skip locked
  ), fixed as (
    update public.product_image_jobs j
       set status=case when s.attempts<3 then 'pending' else 'rejected' end,
           error_message=coalesce(j.error_message,'fallback_worker_timeout'),
           started_at=null,
           processed_at=case when s.attempts<3 then null else now() end,
           updated_at=now()
      from stalled s
     where j.id=s.id
    returning j.product_id,j.status
  )
  select count(*) into v_count from fixed;

  update public.products p
     set image_ai_status=case when j.attempts<3 then 'pending' else 'rejected' end,
         image_ai_error=coalesce(p.image_ai_error,'fallback_worker_timeout'),
         updated_at=now()
    from public.product_image_jobs j
   where j.product_id=p.id
     and j.force_individual=true
     and j.status in ('pending','rejected')
     and p.image_ai_status='processing'
     and j.updated_at > now()-interval '1 minute';
  return v_count;
end;
$$;
revoke all on function public.recover_product_image_fallback_stalls_v1() from public,anon,authenticated;
grant execute on function public.recover_product_image_fallback_stalls_v1() to service_role;

create or replace function public.dispatch_product_image_grid18_worker_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_eligible bigint:=0;
  v_active bigint:=0;
  v_fallback bigint:=0;
  v_request bigint;
  v_enqueued integer:=0;
  v_recovered integer:=0;
  v_event text;
begin
  select public.recover_product_image_fallback_stalls_v1() into v_recovered;
  select public.enqueue_product_image_jobs_v2(72) into v_enqueued;

  select count(*) into v_active
  from public.product_image_batches b
  where b.mode='grid_3x6_18'
    and b.status in ('processing','prepared','generated');

  select count(*) into v_fallback
  from public.product_image_jobs j
  join public.products p on p.id=j.product_id
  where j.status in ('pending','error')
    and j.attempts<3
    and j.force_individual=true
    and coalesce(p.image_ai_ignored,false)=false
    and public.product_image_safe_current_source_v1(p.image_source_url,null);

  select count(*) into v_eligible
  from public.product_image_jobs j
  join public.products p on p.id=j.product_id
  where j.status in ('pending','error')
    and j.attempts<3
    and j.force_individual=false
    and j.grid_attempts<1
    and coalesce(p.image_ai_ignored,false)=false
    and public.product_image_safe_current_source_v1(p.image_source_url,null);

  if v_active>0 then v_event:='advance';
  elsif v_fallback>0 then v_event:='fallback';
  elsif v_eligible>=18 then v_event:='advance';
  else
    return jsonb_build_object('dispatched',false,'reason','nothing_ready','active_batches',v_active,'fallback',v_fallback,'eligible',v_eligible,'enqueued',v_enqueued,'recovered',v_recovered);
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_image_worker_webhook_key_v1'
  order by created_at desc
  limit 1;
  if v_secret is null then return jsonb_build_object('dispatched',false,'reason','worker_secret_missing'); end if;

  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-grid18-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-product-image-key',v_secret),
    body:=jsonb_build_object('event',v_event),
    timeout_milliseconds:=120000
  );

  return jsonb_build_object('dispatched',true,'event',v_event,'request_id',v_request,'active_batches',v_active,'fallback',v_fallback,'eligible',v_eligible,'enqueued',v_enqueued,'recovered',v_recovered);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end;
$$;

with fixable as (
  select p.id
  from public.products p
  join public.product_image_jobs j on j.product_id=p.id
  where p.image_ai_status in ('source_rejected','rejected')
    and p.image_ai_error in ('source_host_not_allowed','trusted_source_missing')
    and j.status in ('rejected','error')
    and j.attempts<3
    and coalesce(p.image_ai_ignored,false)=false
    and public.product_image_safe_current_source_v1(p.image_url,p.image_ai_url)
), upd_p as (
  update public.products p
     set image_source_url=p.image_url,image_source_origin='auto_recovered_after_source_error_v5',image_source_verified_at=null,
         image_source_sha256=null,image_source_width=null,image_source_height=null,
         image_ai_status='pending',image_ai_error=null,updated_at=now()
   where p.id in (select id from fixable)
   returning p.id
)
update public.product_image_jobs j
   set status='pending',force_individual=false,grid_attempts=0,last_batch_id=null,error_message=null,started_at=null,processed_at=null,updated_at=now()
 where j.product_id in (select id from upd_p);
