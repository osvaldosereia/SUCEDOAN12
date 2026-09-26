-- Dona Antonia Operations 2.0
-- Deterministic preflight for switching sellable-stock authority to Bling.
-- Read-only: does not flip authority or mutate stock.

create or replace function public.get_ops2_stock_cutover_preflight_v1()
returns jsonb language sql security definer set search_path=public stable as $$
with cfg as (
 select coalesce(metadata->>'ops2_stock_authority','legacy_shadow') authority,
 nullif(metadata->>'selected_deposit_id','')::bigint deposit_id,
 coalesce((metadata->'ops2_physical_stock_gate'->>'state')='verified',false) physical_gate,
 coalesce((metadata->'ops2_stock_mirror_event_mode'->>'state')='verified',false) mirror_gate
 from public.bling_hub_runtime_v2 where id=1
), coverage as (
 select count(*) filter(where is_active) active,count(*) filter(where is_active and not bling_stock_ready) not_ready from public.ops2_sellable_stock_v1
), recount as (
 select count(*) n from public.ops_attention where status in ('open','acknowledged') and idempotency_key like 'ops2:stock-recount:%'
), reservations as (
 select count(distinct r.order_id) orders,count(*) rows from public.vitrine_stock_reservations r join public.orders o on o.id=r.order_id
 where o.status not in ('cancelled','delivered') and ((r.status='reserved' and r.expires_at>now()) or r.status='consumed')
), stale as (
 select count(distinct r.order_id) orders,count(*) rows from public.vitrine_stock_reservations r join public.orders o on o.id=r.order_id
 where o.status not in ('cancelled','delivered') and r.status='reserved' and r.expires_at<=now()
), controls as (select count(*) filter(where state='review_required') n from public.bling_order_stock_controls_v2)
select jsonb_build_object(
 'authority',cfg.authority,'selected_deposit_id',cfg.deposit_id,'active_products',coverage.active,'active_not_bling_ready',coverage.not_ready,
 'recount_blockers',recount.n,'live_local_reservation_orders',reservations.orders,'live_local_reservation_rows',reservations.rows,
 'stale_local_reservation_orders',stale.orders,'stale_local_reservation_rows',stale.rows,'physical_stock_review_required',controls.n,
 'physical_gate_verified',cfg.physical_gate,'mirror_gate_verified',cfg.mirror_gate,
 'ready',coverage.not_ready=0 and recount.n=0 and reservations.orders=0 and controls.n=0 and cfg.deposit_id is not null and cfg.physical_gate and cfg.mirror_gate,
 'blocking_reasons',to_jsonb(array_remove(array[
 case when coverage.not_ready>0 then 'active_products_not_bling_ready' end,
 case when recount.n>0 then 'physical_recount_pending' end,
 case when reservations.orders>0 then 'legacy_live_reservation_pending' end,
 case when controls.n>0 then 'physical_stock_review_required' end,
 case when cfg.deposit_id is null then 'selected_deposit_missing' end,
 case when not cfg.physical_gate then 'physical_stock_gate_not_verified' end,
 case when not cfg.mirror_gate then 'stock_mirror_gate_not_verified' end],null)))
from cfg,coverage,recount,reservations,stale,controls $$;

revoke all on function public.get_ops2_stock_cutover_preflight_v1() from public,anon,authenticated;
grant execute on function public.get_ops2_stock_cutover_preflight_v1() to service_role;
