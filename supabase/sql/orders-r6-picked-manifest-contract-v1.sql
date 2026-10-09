-- R06 DRAFT contract; NOT a deployed Supabase migration.
-- Runs read-only preview and durable exactly-once snapshot of actual picked lines.
-- The existing ops2_prepare_order_separation_completion_v2 remains owner of
-- financial math; no second stock debit, Bling POST or NF-e is performed.
CREATE OR REPLACE FUNCTION public.ops2_preview_order_reconciliation_v1(
  p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $preview$
DECLARE
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_lines jsonb:='[]'::jsonb;
  v_errors jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_pending integer:=0;
  v_separated integer:=0;
  v_missing integer:=0;
  v_display_only integer:=0;
  v_negative integer:=0;
  v_bad_parent integer:=0;
  v_orphan integer:=0;
  v_duplicate_items integer:=0;
  v_duplicate_reservations integer:=0;
  v_missing_subtotal numeric(14,2):=0;
  v_orig_total numeric(14,2):=0;
  v_orig_subtotal numeric(14,2):=0;
  v_orig_fiscal numeric(14,2):=0;
  v_final_total numeric(14,2):=0;
  v_final_subtotal numeric(14,2):=0;
  v_final_fiscal numeric(14,2):=0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','order_id_required');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','order_not_found');
  END IF;
  SELECT * INTO v_completion FROM public.order_separation_completions_v1
    WHERE order_id=p_order_id;
  -- Do not treat display-only basket parent as another priced item.
  WITH picked AS (
    SELECT s.*,oi.name_snapshot,oi.metadata AS item_metadata,
      coalesce(nullif(oi.metadata->>'history_kind',''),'product') AS history_kind,
      EXISTS(
        SELECT 1 FROM public.order_items child
        WHERE child.order_id=p_order_id
          AND coalesce(child.metadata->>'history_kind','') IN
            ('basket_component','basket_mold_component')
          AND (
            (nullif(oi.metadata->>'basket_id','') IS NOT NULL
              AND child.metadata->>'basket_id'=oi.metadata->>'basket_id')
            OR (
              lower(trim(coalesce(child.metadata->>'basket_name',
                                     child.metadata->>'parent_basket_name','')))=
              lower(trim(coalesce(oi.metadata->>'basket_name',oi.name_snapshot,'')))
              AND length(trim(coalesce(oi.metadata->>'basket_name',oi.name_snapshot,'')))>0
            )
          )
      ) AND coalesce(oi.metadata->>'history_kind','') IN ('basket','basket_mold')
        AS display_only
    FROM public.order_separation_items_v1 s
      LEFT JOIN public.order_items oi
        ON oi.id=s.order_item_id AND oi.order_id=p_order_id
    WHERE s.order_id=p_order_id
  )
  SELECT
    count(*)::integer,
    count(*) FILTER(WHERE state='pending')::integer,
    count(*) FILTER(WHERE state='separated' AND NOT display_only)::integer,
    count(*) FILTER(WHERE state='missing' AND NOT display_only)::integer,
    count(*) FILTER(WHERE display_only)::integer,
    count(*) FILTER(WHERE quantity<=0 OR unit_price<0 OR line_total<0)::integer,
    count(*) FILTER(WHERE display_only AND line_total<>0)::integer,
    count(*) FILTER(WHERE name_snapshot IS NULL)::integer,
    round(coalesce(sum(line_total) FILTER(WHERE state='missing' AND NOT display_only),0)::numeric,2),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'order_item_id',order_item_id,'product_id',product_id,
      'name',name_snapshot,'state',state,'quantity',quantity,
      'unit_price',unit_price,'line_total',line_total,
      'history_kind',history_kind,
      'basket_id',nullif(item_metadata->>'basket_id',''),
      'basket_name',nullif(item_metadata->>'basket_name',''),
      'preassembled_units',nullif(item_metadata->>'preassembled_units',''),
      'display_only',display_only,
      'deliverable',state='separated' AND NOT display_only
    )) ORDER BY order_item_id),'[]'::jsonb)
  INTO v_count,v_pending,v_separated,v_missing,v_display_only,
       v_negative,v_bad_parent,v_orphan,v_missing_subtotal,v_lines
  FROM picked;

  SELECT count(*) INTO v_duplicate_items FROM (
    SELECT order_item_id FROM public.order_separation_items_v1
    WHERE order_id=p_order_id GROUP BY order_item_id HAVING count(*)>1
  ) d;
  SELECT count(*) INTO v_duplicate_reservations FROM (
    SELECT product_id FROM public.vitrine_stock_reservations
    WHERE order_id=p_order_id AND status='reserved'
    GROUP BY product_id HAVING count(*)>1
  ) d;

  v_orig_total:=coalesce(v_completion.original_total,v_order.total,0);
  v_orig_subtotal:=coalesce(v_completion.original_subtotal,v_order.subtotal,0);
  v_orig_fiscal:=coalesce(v_completion.original_fiscal_subtotal,v_order.fiscal_subtotal,0);
  v_final_total:=round(v_orig_total-v_missing_subtotal,2);
  v_final_subtotal:=round(v_orig_subtotal-v_missing_subtotal,2);
  v_final_fiscal:=round(v_orig_fiscal-v_missing_subtotal,2);

  IF v_count=0 THEN v_errors:=v_errors||to_jsonb('order_has_no_items'::text); END IF;
  IF v_pending>0 THEN v_errors:=v_errors||to_jsonb('separation_incomplete'::text); END IF;
  IF v_separated=0 THEN v_errors:=v_errors||to_jsonb('no_deliverable_items'::text); END IF;
  IF v_negative>0 THEN v_errors:=v_errors||to_jsonb('invalid_item_amount_or_quantity'::text); END IF;
  IF v_orphan>0 THEN v_errors:=v_errors||to_jsonb('order_item_mismatch'::text); END IF;
  IF v_duplicate_items>0 THEN v_errors:=v_errors||to_jsonb('duplicate_picking_rows'::text); END IF;
  IF v_duplicate_reservations>0 THEN v_errors:=v_errors||to_jsonb('duplicate_reservations_for_product'::text); END IF;
  IF v_bad_parent>0 THEN v_errors:=v_errors||to_jsonb('priced_basket_parent_duplicates_components'::text); END IF;
  IF v_final_total<0 OR v_final_subtotal<0 OR v_final_fiscal<0 THEN
    v_errors:=v_errors||to_jsonb('missing_adjustment_exceeds_order_value'::text);
  END IF;
  IF v_completion.id IS NULL AND v_order.status NOT IN ('confirmed','processing') THEN
    v_errors:=v_errors||to_jsonb('order_not_in_separation'::text);
  END IF;
  IF v_completion.id IS NOT NULL AND
     (v_completion.missing_subtotal IS DISTINCT FROM v_missing_subtotal OR
      v_completion.final_total IS DISTINCT FROM v_final_total) THEN
    v_errors:=v_errors||to_jsonb('prepared_financial_snapshot_mismatch'::text);
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'order_id',p_order_id,'public_order_number',v_order.order_number,
    'ready',jsonb_array_length(v_errors)=0,'blockers',v_errors,
    'counts',jsonb_build_object('total',v_count,'pending',v_pending,
      'separated',v_separated,'missing',v_missing,'display_only',v_display_only),
    'financial',jsonb_build_object(
      'original_total',v_orig_total,'original_subtotal',v_orig_subtotal,
      'original_fiscal_subtotal',v_orig_fiscal,
      'missing_subtotal',v_missing_subtotal,'final_total',v_final_total,
      'final_subtotal',v_final_subtotal,'final_fiscal_subtotal',v_final_fiscal,
      'discount',coalesce(v_completion.original_discount,v_order.discount,0),
      'other_expenses',coalesce(v_completion.original_other_expenses,v_order.other_expenses,0),
      'basket_hidden_adjustment',coalesce(v_completion.original_basket_hidden_adjustment,v_order.basket_hidden_adjustment,0)
    ),
    'lines',v_lines,
    'source','separation_r6'
  );
END
$preview$;
REVOKE ALL ON FUNCTION public.ops2_preview_order_reconciliation_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_preview_order_reconciliation_v1(uuid)
  TO service_role;

-- Lock the prepared completion; write the immutable manifest ONCE.
-- No changes to original item rows, stock quantities, invoice or order totals.
CREATE OR REPLACE FUNCTION public.ops2_record_order_reconciliation_v1(
  p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $record$
DECLARE
  v_row public.order_separation_completions_v1%rowtype;
  v_manifest jsonb;
  v_existing jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','order_id_required');
  END IF;
  SELECT * INTO v_row FROM public.order_separation_completions_v1
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','separation_not_prepared');
  END IF;
  v_existing:=v_row.metadata->'r6_reconciliation';
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'recorded',false,'idempotent',true,
      'manifest',v_existing);
  END IF;
  IF v_row.phase NOT IN ('prepared','needs_attention') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_reconciliation_phase');
  END IF;
  v_manifest:=public.ops2_preview_order_reconciliation_v1(p_order_id);
  IF v_manifest->>'ok'<>'true' OR v_manifest->>'ready'<>'true' THEN
    RETURN jsonb_build_object('ok',false,'error','reconciliation_blocked',
      'blockers',coalesce(v_manifest->'blockers','[]'::jsonb));
  END IF;
  -- This is the payment/fiscal SNAPSHOT to be consumed by R07's Bling adapter.
  UPDATE public.order_separation_completions_v1
  SET metadata=coalesce(metadata,'{}'::jsonb)
        ||jsonb_build_object('r6_reconciliation',v_manifest,
          'r6_reconciliation_recorded_at',clock_timestamp()),
      updated_at=clock_timestamp()
  WHERE order_id=p_order_id;
  RETURN jsonb_build_object('ok',true,'recorded',true,'idempotent',false,
    'manifest',v_manifest);
END
$record$;
REVOKE ALL ON FUNCTION public.ops2_record_order_reconciliation_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_record_order_reconciliation_v1(uuid)
  TO service_role;
