
create or replace function public.ops2_verify_catalog_stock_canary_v2(p_canary uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_confirmed int:=0;
  v_divergent int:=0;
  v_pending int:=0;
begin
  if not exists(select 1 from public.ops2_catalog_sync_canaries where id=p_canary) then
    raise exception 'canary_not_found';
  end if;

  with evidence as (
    select i.canary_id,i.product_id,i.desired_stock,i.error,
           j.status job_status,j.result job_result,
           m.physical_total mirror_stock
    from public.ops2_catalog_sync_canary_items i
    join public.bling_hub_jobs_v2 j on j.id=i.job_id
    left join public.bling_stock_mirror_v2 m on m.product_id=i.product_id
    where i.canary_id=p_canary
  )
  update public.ops2_catalog_sync_canary_items i
  set verified_bling_physical = case
        when e.job_status='synced' and coalesce((e.job_result->>'verified')::boolean,false)
          then nullif(e.job_result->>'stock','')::numeric
        else e.mirror_stock
      end,
      verified_at=now(),
      state=case
        when e.job_status='synced'
         and coalesce((e.job_result->>'verified')::boolean,false)
         and nullif(e.job_result->>'stock','')::numeric is not distinct from e.desired_stock
          then 'confirmed'
        when e.mirror_stock is not distinct from e.desired_stock
          then 'confirmed'
        when e.job_status in ('pending','processing','retry') then 'queued'
        else 'divergent'
      end,
      error=case
        when e.job_status='synced'
         and coalesce((e.job_result->>'verified')::boolean,false)
         and nullif(e.job_result->>'stock','')::numeric is not distinct from e.desired_stock
          then null
        else e.error
      end
  from evidence e
  where i.canary_id=e.canary_id and i.product_id=e.product_id;

  select count(*) filter(where state='confirmed'),
         count(*) filter(where state='divergent'),
         count(*) filter(where state not in ('confirmed','divergent'))
  into v_confirmed,v_divergent,v_pending
  from public.ops2_catalog_sync_canary_items where canary_id=p_canary;

  if v_divergent=0 and v_pending=0 and v_confirmed>0 then
    update public.ops2_catalog_sync_plan_items p
       set state='confirmed',current_bling_physical=i.desired_stock,updated_at=now()
      from public.ops2_catalog_sync_canary_items i
     where i.canary_id=p_canary and i.product_id=p.product_id and p.run_id=i.run_id and i.state='confirmed';

    update public.ops2_catalog_sync_canaries
       set status='verified',external_write_enabled=false
     where id=p_canary;
  elsif v_divergent>0 then
    update public.ops2_catalog_sync_canaries
       set status='divergent',external_write_enabled=false
     where id=p_canary;
  end if;

  return jsonb_build_object('canary_id',p_canary,'confirmed',v_confirmed,'divergent',v_divergent,'pending',v_pending,'evidence','job_read_after_write_or_mirror');
end $$;

revoke all on function public.ops2_verify_catalog_stock_canary_v2(uuid) from public,anon,authenticated;
grant execute on function public.ops2_verify_catalog_stock_canary_v2(uuid) to service_role;
