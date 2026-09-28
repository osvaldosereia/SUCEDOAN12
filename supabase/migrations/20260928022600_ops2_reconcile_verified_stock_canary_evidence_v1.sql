with verified as (
  select i.canary_id,i.run_id,i.product_id,i.desired_stock,
         nullif(j.result->>'stock','')::numeric observed_stock
  from public.ops2_catalog_sync_canary_items i
  join public.bling_hub_jobs_v2 j on j.id=i.job_id
  where j.status='synced'
    and coalesce((j.result->>'verified')::boolean,false)
    and nullif(j.result->>'stock','')::numeric is not distinct from i.desired_stock
)
update public.ops2_catalog_sync_canary_items i
set state='confirmed',verified_bling_physical=v.observed_stock,verified_at=now(),error=null
from verified v
where i.canary_id=v.canary_id and i.product_id=v.product_id and i.state<>'confirmed';

with complete as (
  select c.id
  from public.ops2_catalog_sync_canaries c
  join public.ops2_catalog_sync_canary_items i on i.canary_id=c.id
  group by c.id,c.item_count
  having count(*)=c.item_count and count(*) filter(where i.state='confirmed')=c.item_count and c.item_count>0
)
update public.ops2_catalog_sync_canaries c
set status='verified',external_write_enabled=false
from complete x where c.id=x.id and c.status<>'verified';

update public.ops2_catalog_sync_plan_items p
set state='confirmed',current_bling_physical=i.desired_stock,updated_at=now()
from public.ops2_catalog_sync_canary_items i
join public.ops2_catalog_sync_canaries c on c.id=i.canary_id
where c.status='verified' and i.state='confirmed'
  and p.run_id=i.run_id and p.product_id=i.product_id and p.state<>'confirmed';
