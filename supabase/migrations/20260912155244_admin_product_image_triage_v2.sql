alter table public.products
  add column if not exists image_ai_ignored boolean not null default false,
  add column if not exists image_ai_admin_note text,
  add column if not exists image_ai_admin_updated_at timestamptz;

create index if not exists idx_products_image_ai_triage_v2
  on public.products(image_ai_ignored,image_ai_status,updated_at desc);

create or replace function public.claim_product_image_grid18_batch_v1()
returns table(batch_id uuid, item_count integer)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function public.claim_product_image_fallback_v1(p_limit integer default 1)
returns table(id uuid, product_id uuid, attempts integer, model text)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function public.claim_product_image_grid18_batch_v1() from public, anon, authenticated;
revoke all on function public.claim_product_image_fallback_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_product_image_grid18_batch_v1() to service_role;
grant execute on function public.claim_product_image_fallback_v1(integer) to service_role;
