begin;

alter table public.bling_history_import_runtime
  add column if not exists lock_owner uuid,
  add column if not exists locked_until timestamptz;

create or replace function public.claim_bling_history_import_lock_v1(
  p_owner uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claimed boolean:=false;
begin
  if p_owner is null then raise exception 'owner_required'; end if;

  update public.bling_history_import_runtime
     set lock_owner=p_owner,
         locked_until=now()+make_interval(secs=>greatest(30,least(coalesce(p_ttl_seconds,120),600))),
         updated_at=now()
   where id=1
     and (locked_until is null or locked_until<now() or lock_owner=p_owner)
  returning true into v_claimed;

  return coalesce(v_claimed,false);
end
$$;

create or replace function public.release_bling_history_import_lock_v1(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_released boolean:=false;
begin
  update public.bling_history_import_runtime
     set lock_owner=null,locked_until=null,updated_at=now()
   where id=1 and lock_owner=p_owner
  returning true into v_released;

  return coalesce(v_released,false);
end
$$;

create or replace function public.promote_ready_bling_history_batch_v1(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.bling_history_import_runtime%rowtype;
  r record;
  promoted integer:=0;
  duplicates integer:=0;
  errors integer:=0;
  results jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  select * into cfg from public.bling_history_import_runtime where id=1;
  if not found or cfg.promotion_enabled is not true then
    raise exception 'bling_history_promotion_disabled';
  end if;

  for r in
    select id,bling_order_id
    from public.bling_history_staging_orders
    where reconciliation_status='ready'
      and canonical_status='delivered'
    order by order_date,bling_order_id
    limit greatest(1,least(coalesce(p_limit,25),100))
  loop
    begin
      v_result:=public.promote_bling_history_order_v1(r.id);
      promoted:=promoted+case when v_result->>'status'='promoted' then 1 else 0 end;
      duplicates:=duplicates+case when v_result->>'status' in ('duplicate_local','already_promoted') then 1 else 0 end;
      results:=results||jsonb_build_array(jsonb_build_object('bling_order_id',r.bling_order_id,'result',v_result));
    exception when others then
      errors:=errors+1;
      results:=results||jsonb_build_array(jsonb_build_object('bling_order_id',r.bling_order_id,'error',sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'promoted',promoted,
    'duplicates',duplicates,
    'errors',errors,
    'results',results
  );
end
$$;

revoke all on function public.claim_bling_history_import_lock_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_bling_history_import_lock_v1(uuid) from public,anon,authenticated;
revoke all on function public.promote_ready_bling_history_batch_v1(integer) from public,anon,authenticated;
grant execute on function public.claim_bling_history_import_lock_v1(uuid,integer) to service_role;
grant execute on function public.release_bling_history_import_lock_v1(uuid) to service_role;
grant execute on function public.promote_ready_bling_history_batch_v1(integer) to service_role;

commit;
