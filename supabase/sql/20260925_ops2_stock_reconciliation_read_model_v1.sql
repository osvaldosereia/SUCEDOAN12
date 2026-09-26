-- Dona Antônia Operations 2.0
-- Read-only queue for stock reconciliation before Bling cutover.

create or replace view public.ops2_stock_reconciliation_v1
with (security_invoker=true)
as
select
  s.product_id,
  s.name,
  s.sku,
  s.gtin,
  s.legacy_stock,
  s.sellable_physical,
  s.sellable_virtual,
  (s.legacy_stock-s.sellable_virtual) as quantity_delta,
  case
    when s.legacy_stock>0 and s.sellable_virtual=0 and coalesce(p.physically_verified,false)
      then 'bling_zero_local_verified'
    when s.legacy_stock>0 and s.sellable_virtual=0
      then 'bling_zero_recount_required'
    when s.legacy_stock=0 and s.sellable_virtual>0
      then 'local_zero_recount_required'
    when s.legacy_stock>0 and s.sellable_virtual>=s.legacy_stock*5
      then 'bling_extreme_high'
    when s.sellable_virtual>0 and s.legacy_stock>=s.sellable_virtual*5
      then 'legacy_extreme_high'
    else 'quantity_difference'
  end as reconciliation_class,
  case
    when s.legacy_stock>0 and s.sellable_virtual=0 and coalesce(p.physically_verified,false)
      then 'verify_bling_opening_balance'
    when s.legacy_stock>0 and s.sellable_virtual=0
      then 'physical_recount_before_adjustment'
    when s.legacy_stock=0 and s.sellable_virtual>0
      then 'physical_recount_before_cutover'
    when s.legacy_stock>0 and s.sellable_virtual>=s.legacy_stock*5
      then 'review_packaging_conversion_and_bling_balance'
    when s.sellable_virtual>0 and s.legacy_stock>=s.sellable_virtual*5
      then 'review_packaging_conversion_and_local_balance'
    else 'review_quantity_history'
  end as recommended_action,
  p.packaging,
  p.unit,
  p.physically_verified,
  p.physically_verified_at,
  p.last_counted_at,
  s.bling_product_id,
  s.mirror_observed_at,
  s.selected_deposit_id
from public.ops2_sellable_stock_v1 s
join public.products p on p.id=s.product_id
where s.is_active=true
  and s.bling_stock_ready=true
  and abs(s.legacy_stock-s.sellable_virtual)>0.0001;

revoke all on public.ops2_stock_reconciliation_v1 from anon,authenticated;
grant select on public.ops2_stock_reconciliation_v1 to service_role;

comment on view public.ops2_stock_reconciliation_v1 is
'Operations 2.0: fila read-only de divergencias de estoque entre legado e Bling, classificada por risco. Nao corrige saldos automaticamente.';
