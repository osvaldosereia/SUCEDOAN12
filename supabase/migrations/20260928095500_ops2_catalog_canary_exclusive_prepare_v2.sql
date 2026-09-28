
create or replace function public.ops2_prepare_catalog_stock_canary_v1(p_run uuid, p_limit integer default 5)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_lim int:=greatest(1,least(coalesce(p_limit,5),20));
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ops2_catalog_stock_canary:'||p_run::text,0));

  if not exists(select 1 from public.ops2_catalog_baseline_runs where id=p_run and status='planned') then
    raise exception 'run_not_planned';
  end if;
  if exists(select 1 from public.ops2_catalog_sync_plan_items where run_id=p_run and state='blocked') then
    raise exception 'plan_has_blockers';
  end if;

  insert into public.ops2_catalog_sync_canaries(run_id,max_items,notes)
  values(p_run,v_lim,'deterministic risk-band canary; external writes disabled')
  returning id into v_id;

  insert into public.ops2_catalog_sync_canary_items(
    canary_id,run_id,product_id,bling_product_id,desired_stock,bling_physical_before,delta
  )
  select v_id,p_run,p.product_id,p.bling_product_id,p.desired_stock,p.current_bling_physical,
         p.desired_stock-coalesce(p.current_bling_physical,0)
  from public.ops2_catalog_sync_plan_items p
  where p.run_id=p_run
    and p.operation='stock_update'
    and p.state='planned'
    and not exists(
      select 1
      from public.ops2_catalog_sync_canary_items ai
      join public.ops2_catalog_sync_canaries ac on ac.id=ai.canary_id
      where ai.product_id=p.product_id
        and ai.run_id=p.run_id
        and ac.status in ('prepared','armed','queued','sent','divergent')
    )
  order by abs(p.desired_stock-coalesce(p.current_bling_physical,0)),p.product_id
  limit v_lim;

  select count(*) into v_count from public.ops2_catalog_sync_canary_items where canary_id=v_id;
  update public.ops2_catalog_sync_canaries
     set item_count=v_count,
         status=case when v_count=0 then 'rolled_back' else status end,
         notes=case when v_count=0 then 'no eligible unreserved items' else notes end
   where id=v_id;

  return v_id;
end $$;

revoke all on function public.ops2_prepare_catalog_stock_canary_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.ops2_prepare_catalog_stock_canary_v1(uuid,integer) to service_role;
