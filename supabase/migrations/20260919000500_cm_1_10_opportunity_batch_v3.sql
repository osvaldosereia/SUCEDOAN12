-- CM-1.10 v3: batch materialization for deterministic opportunities.

create or replace function public.refresh_customer_opportunities_batch_v1(
  p_after uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r record;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_processed integer:=0;
  v_last uuid:=null;
  v_has_more boolean:=false;
  v_result jsonb;
  v_total_detected integer:=0;
begin
  for r in
    select c.id
    from public.customers c
    left join public.customer_commercial_profile_v1 cp on cp.customer_id=c.id
    left join public.customer_segment_facts_v1 sf on sf.customer_id=c.id
    where (p_after is null or c.id>p_after)
      and (
        coalesce(cp.order_count,0)>0
        or coalesce(sf.has_incomplete_cart,false)
      )
    order by c.id
    limit v_limit
  loop
    v_result:=public.refresh_customer_opportunities_v1(r.id);
    v_processed:=v_processed+1;
    v_last:=r.id;
    v_total_detected:=v_total_detected+coalesce((v_result->>'evaluated_count')::int,0);
  end loop;

  if v_last is not null then
    select exists(
      select 1
      from public.customers c
      left join public.customer_commercial_profile_v1 cp on cp.customer_id=c.id
      left join public.customer_segment_facts_v1 sf on sf.customer_id=c.id
      where c.id>v_last
        and (coalesce(cp.order_count,0)>0 or coalesce(sf.has_incomplete_cart,false))
    ) into v_has_more;
  end if;

  return jsonb_build_object(
    'ok',true,
    'processed',v_processed,
    'opportunities_detected',v_total_detected,
    'last_customer_id',v_last,
    'has_more',v_has_more,
    'engine_version','cm1.10-v1',
    'external_side_effect',false
  );
end;
$function$;

revoke all on function public.refresh_customer_opportunities_batch_v1(uuid,integer)
from public,anon,authenticated;
grant execute on function public.refresh_customer_opportunities_batch_v1(uuid,integer)
to service_role;
