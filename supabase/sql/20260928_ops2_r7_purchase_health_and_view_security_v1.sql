alter view public.ops2_product_lot_summary_v1 set (security_invoker=true);
alter view public.ops2_expiry_offer_policy_v1 set (security_invoker=true);
revoke all on public.ops2_product_lot_summary_v1 from anon,authenticated;
revoke all on public.ops2_expiry_offer_policy_v1 from anon,authenticated;
grant select on public.ops2_product_lot_summary_v1 to service_role;
grant select on public.ops2_expiry_offer_policy_v1 to service_role;

create or replace function public.get_ops2_purchase_xml_health_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
select jsonb_build_object(
  'generated_at',now(),
  'documents_total',(select count(*) from purchase_xml_documents),
  'documents_processed',(select count(*) from purchase_xml_documents where processing_status='processed'),
  'documents_review',(select count(*) from purchase_xml_documents where processing_status='review_required'),
  'items_total',(select count(*) from purchase_xml_items),
  'items_inferred_xml',(select count(*) from purchase_xml_items where conversion_status='inferred_xml'),
  'items_known',(select count(*) from purchase_xml_items where conversion_status='known'),
  'items_not_needed',(select count(*) from purchase_xml_items where conversion_status='not_needed'),
  'items_review',(select count(*) from purchase_xml_items where conversion_status='review_required' or processing_status='review_required'),
  'unsafe_conversion_quarantined',(select count(*) from purchase_xml_items where metadata ? 'unsafe_conversion_quarantined_at'),
  'lot_evidence_rows',(select count(*) from purchase_xml_item_lot_evidence),
  'receipt_plans',(select count(*) from purchase_stock_receipt_plans_v1),
  'receipt_plans_waiting',(select count(*) from purchase_stock_receipt_plans_v1 where status='awaiting_bling_receipt'),
  'receipt_plans_review',(select count(*) from purchase_stock_receipt_plans_v1 where status='review_required'),
  'receipt_plans_verified',(select count(*) from purchase_stock_receipt_plans_v1 where status='verified'),
  'stock_receipts_applied',(select count(*) from purchase_stock_receipts where status='applied'),
  'cpf_finance_violations',(select count(*) from purchase_xml_documents
    where recipient_kind='CPF'
      and (financial_eligible<>false
        or finance_status<>'blocked_personal'
        or jsonb_array_length(coalesce(finance_reference->'accounts','[]'::jsonb))>0)),
  'daily_enabled',(select daily_enabled from purchase_xml_settings where id=1),
  'daily_hour_cuiaba',(select daily_hour_cuiaba from purchase_xml_settings where id=1),
  'daily_lookback_days',(select daily_lookback_days from purchase_xml_settings where id=1),
  'stock_authority',(select coalesce(metadata->>'ops2_stock_authority','legacy_shadow') from bling_hub_runtime_v2 where id=1)
);
$$;

revoke all on function public.get_ops2_purchase_xml_health_v1() from public,anon,authenticated;
grant execute on function public.get_ops2_purchase_xml_health_v1() to service_role;