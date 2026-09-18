begin;

create or replace function public.promote_bling_history_ready_batch_v1(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_gate boolean:=false;
  v_promoted integer:=0;
  v_duplicates integer:=0;
  v_errors integer:=0;
  r record;
  v_result jsonb;
begin
  select coalesce(promotion_enabled,false)
    into v_old_gate
  from public.bling_history_import_runtime
  where id=1
  for update;

  update public.bling_history_import_runtime
     set promotion_enabled=true,updated_at=now()
   where id=1;

  for r in
    select s.id
    from public.bling_history_staging_orders s
    where s.reconciliation_status='ready'
      and s.canonical_status='delivered'
      and s.status_id=9
      and s.matched_customer_id is not null
      and s.customer_match_method in ('bling_contact_id','document_exact','phone_exact')
      and not exists(
        select 1
        from public.bling_history_reconciliation_issues i
        where i.staging_order_id=s.id
          and i.resolved=false
          and i.severity='blocking'
      )
    order by s.order_date,s.bling_order_id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    begin
      v_result:=public.promote_bling_history_order_v1(r.id);
      if v_result->>'status'='promoted' then
        v_promoted:=v_promoted+1;
      elsif v_result->>'status' in ('duplicate_local','already_promoted') then
        v_duplicates:=v_duplicates+1;
      end if;
    exception when others then
      v_errors:=v_errors+1;
    end;
  end loop;

  update public.bling_history_import_runtime
     set promotion_enabled=v_old_gate,updated_at=now()
   where id=1;

  return jsonb_build_object(
    'promoted',v_promoted,
    'duplicates',v_duplicates,
    'errors',v_errors,
    'remaining_ready',(
      select count(*)
      from public.bling_history_staging_orders
      where reconciliation_status='ready'
        and canonical_status='delivered'
        and status_id=9
        and matched_customer_id is not null
    )
  );
exception when others then
  update public.bling_history_import_runtime
     set promotion_enabled=v_old_gate,updated_at=now()
   where id=1;
  raise;
end
$$;

revoke all on function public.promote_bling_history_ready_batch_v1(integer) from public,anon,authenticated;
grant execute on function public.promote_bling_history_ready_batch_v1(integer) to service_role;

commit;
