begin;

create or replace function public.refresh_product_fiscal_review_state_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_blocked integer:=0;
  v_reopened integer:=0;
begin
  with upd as (
    update public.product_fiscal_profiles pf
    set review_status='blocked',updated_at=now()
    where pf.review_status not in ('human_validated','auto_validated')
      and exists (
        select 1 from public.product_fiscal_review_items r
        where r.product_id=pf.product_id
          and r.status in ('open','in_review')
          and r.severity='blocker'
      )
    returning 1
  )
  select count(*) into v_blocked from upd;

  with upd as (
    update public.product_fiscal_profiles pf
    set review_status='pending',updated_at=now()
    where pf.review_status='blocked'
      and not exists (
        select 1 from public.product_fiscal_review_items r
        where r.product_id=pf.product_id
          and r.status in ('open','in_review')
          and r.severity='blocker'
      )
    returning 1
  )
  select count(*) into v_reopened from upd;

  return jsonb_build_object(
    'ok',true,
    'blocked_profiles',v_blocked,
    'reopened_profiles',v_reopened
  );
end;
$$;

revoke all on function public.refresh_product_fiscal_review_state_v1() from public;
grant execute on function public.refresh_product_fiscal_review_state_v1() to service_role;

commit;
