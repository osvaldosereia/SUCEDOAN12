
alter table public.ops2_catalog_sync_canaries
  add column if not exists risk_band integer;

create or replace function public.ops2_prepare_catalog_stock_canary_band_v1(
  p_run uuid,p_abs_delta integer,p_limit integer default 5
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_band int:=greatest(1,coalesce(p_abs_delta,1));
  v_cap int;
  v_lim int;
  v_count int;
begin
  if v_band>10 then raise exception 'band_requires_manual_or_high_risk_gate'; end if;
  v_cap:=case when v_band<=5 then 5 else 3 end;
  v_lim:=greatest(1,least(coalesce(p_limit,v_cap),v_cap));
  perform pg_advisory_xact_lock(hashtextextended('ops2_catalog_stock_canary:'||p_run::text,0));

  if not exists(select 1 from public.ops2_catalog_baseline_runs where id=p_run and status='planned') then raise exception 'run_not_planned'; end if;
  if exists(select 1 from public.ops2_catalog_sync_plan_items where run_id=p_run and state='blocked') then raise exception 'plan_has_blockers'; end if;

  insert into public.ops2_catalog_sync_canaries(run_id,max_items,risk_band,notes)
  values(p_run,v_lim,v_band,'exact risk-band canary; external writes disabled')
  returning id into v_id;

  insert into public.ops2_catalog_sync_canary_items(canary_id,run_id,product_id,bling_product_id,desired_stock,bling_physical_before,delta)
  select v_id,p_run,p.product_id,p.bling_product_id,p.desired_stock,p.current_bling_physical,
         p.desired_stock-coalesce(p.current_bling_physical,0)
  from public.ops2_catalog_sync_plan_items p
  where p.run_id=p_run and p.operation='stock_update' and p.state='planned'
    and abs(p.desired_stock-coalesce(p.current_bling_physical,0))=v_band
    and not exists(
      select 1 from public.ops2_catalog_sync_canary_items ai
      join public.ops2_catalog_sync_canaries ac on ac.id=ai.canary_id
      where ai.product_id=p.product_id and ai.run_id=p.run_id
        and ac.status in ('prepared','armed','queued','sent','divergent')
    )
  order by p.product_id
  limit v_lim;

  select count(*) into v_count from public.ops2_catalog_sync_canary_items where canary_id=v_id;
  update public.ops2_catalog_sync_canaries
     set item_count=v_count,
         status=case when v_count=0 then 'rolled_back' else status end,
         notes=case when v_count=0 then 'no eligible unreserved items for exact risk band' else notes end
   where id=v_id;
  return v_id;
end $$;

create or replace function public.ops2_arm_catalog_stock_canary_band_v1(
  p_canary uuid,p_band integer,p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count int; v_status text; v_cap int;
begin
  if p_band<2 or p_band>10 then raise exception 'unsupported_auto_band'; end if;
  if p_confirmation<>('ARMAR_CANARIO_ESTOQUE_BLING_DELTA_'||p_band::text) then raise exception 'confirmation_required'; end if;
  v_cap:=case when p_band<=5 then 5 else 3 end;

  select status,item_count into v_status,v_count
  from public.ops2_catalog_sync_canaries where id=p_canary for update;
  if not found then raise exception 'canary_not_found'; end if;
  if v_status<>'prepared' then raise exception 'canary_not_prepared'; end if;
  if v_count<1 or v_count>v_cap then raise exception 'invalid_canary_size'; end if;
  if exists(select 1 from public.ops2_catalog_sync_canary_items where canary_id=p_canary and abs(delta)<>p_band) then raise exception 'wrong_risk_band'; end if;
  if exists(
    select 1 from public.ops2_catalog_sync_canary_items i
    join public.products p on p.id=i.product_id
    where i.canary_id=p_canary and p.stock is distinct from i.desired_stock
  ) then raise exception 'live_supabase_stock_drift'; end if;

  update public.ops2_catalog_sync_canaries
     set status='armed',external_write_enabled=true,risk_band=p_band
   where id=p_canary;
  return jsonb_build_object('ok',true,'canary_id',p_canary,'status','armed','item_count',v_count,'risk_band',p_band,'live_stock_guard',true);
end $$;

revoke all on function public.ops2_prepare_catalog_stock_canary_band_v1(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.ops2_arm_catalog_stock_canary_band_v1(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ops2_prepare_catalog_stock_canary_band_v1(uuid,integer,integer) to service_role;
grant execute on function public.ops2_arm_catalog_stock_canary_band_v1(uuid,integer,text) to service_role;
