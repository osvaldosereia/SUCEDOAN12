-- R05 draft (no production DDL). Requires R04 draft contract.
-- Fix bypasses through UPSERT on assignments/items/completions.
-- Fail closed only when R04's opt-in runtime flag has been activated.
DROP TRIGGER IF EXISTS trg_ops2_order_meta_assignment_guard_v1
  ON public.order_separation_assignments_v1;
CREATE TRIGGER trg_ops2_order_meta_assignment_guard_v1
  BEFORE INSERT OR UPDATE ON public.order_separation_assignments_v1
  FOR EACH ROW EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

DROP TRIGGER IF EXISTS trg_ops2_order_meta_picking_guard_v1
  ON public.order_separation_items_v1;
CREATE TRIGGER trg_ops2_order_meta_picking_guard_v1
  BEFORE INSERT OR UPDATE ON public.order_separation_items_v1
  FOR EACH ROW WHEN (NEW.state IN ('separated','missing'))
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

DROP TRIGGER IF EXISTS trg_ops2_order_meta_completion_guard_v1
  ON public.order_separation_completions_v1;
CREATE TRIGGER trg_ops2_order_meta_completion_guard_v1
  BEFORE INSERT OR UPDATE ON public.order_separation_completions_v1
  FOR EACH ROW
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

-- Service-side query for live UI and API action guards.
-- It returns flags about the SAME ledger the database triggers enforce.
CREATE OR REPLACE FUNCTION public.ops2_order_meta_confirmation_status_v1(
  p_order_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $status$
DECLARE
  v_order public.orders%rowtype;
  v_enabled boolean := false;
  v_since timestamptz;
  v_proof uuid;
  v_applicable boolean := false;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','order_id_required');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','order_not_found');
  END IF;
  SELECT enforce_new_orders,enabled_at INTO v_enabled,v_since
    FROM public.order_meta_confirmation_runtime_v1 WHERE id=1;
  v_applicable := coalesce(v_enabled,false)
    AND v_since IS NOT NULL AND v_order.created_at>=v_since
    AND v_order.source IN ('vitrine','storefront_v2','manual_whatsapp','papoai','reorder');
  SELECT order_id INTO v_proof
    FROM public.order_meta_confirmations_v1 WHERE order_id=p_order_id;
  RETURN jsonb_build_object(
    'ok',true,'order_id',p_order_id,
    'enforcement_enabled',coalesce(v_enabled,false),
    'confirmation_required',v_applicable AND v_proof IS NULL,
    'confirmation_verified',v_proof IS NOT NULL,
    'applies_to_order',v_applicable
  );
END $status$;
REVOKE ALL ON FUNCTION public.ops2_order_meta_confirmation_status_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_order_meta_confirmation_status_v1(uuid) TO service_role;

-- Avoid exposing order proof to anonymous store or browser.
COMMENT ON FUNCTION public.ops2_order_meta_confirmation_status_v1(uuid)
  IS 'Private service-role status of verified Meta order confirmation, not customer authorization by text.';


-- Existing queue feed checks active admin. Wrap it to attach server-derived
-- Meta proof to each queue card, without N+1 requests.
CREATE OR REPLACE FUNCTION public.manual_pick_queue_meta_feed_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $feed$
DECLARE
  v_uid uuid:=auth.uid();
  v_base jsonb;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.admin_users a WHERE a.user_id=v_uid AND a.is_active=true
  ) THEN
    RAISE EXCEPTION 'admin_not_authorized' USING errcode='42501';
  END IF;
  v_base:=public.manual_pick_queue_feed_v1();
  IF v_base->>'ok'<>'true' OR jsonb_typeof(v_base->'orders')<>'array' THEN
    RAISE EXCEPTION 'queue_unavailable';
  END IF;
  SELECT coalesce(jsonb_agg(
      row_obj.obj||jsonb_build_object(
        'meta_confirmation_required',
          public.ops2_meta_order_confirmation_required_v1((row_obj.obj->>'id')::uuid),
        'meta_confirmation_verified',
          EXISTS(SELECT 1 FROM public.order_meta_confirmations_v1 c
                 WHERE c.order_id=(row_obj.obj->>'id')::uuid)
      ) ORDER BY row_obj.ordinal
    ),'[]'::jsonb)
  INTO v_rows
  FROM jsonb_array_elements(v_base->'orders') WITH ORDINALITY row_obj(obj,ordinal);
  RETURN jsonb_set(v_base,'{orders}',v_rows);
END
$feed$;
REVOKE ALL ON FUNCTION public.manual_pick_queue_meta_feed_v1()
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manual_pick_queue_meta_feed_v1()
  TO authenticated,service_role;
