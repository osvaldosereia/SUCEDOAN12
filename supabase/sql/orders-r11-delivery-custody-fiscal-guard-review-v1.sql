-- R11 DRAFT ONLY. Apply in staging after the reviewed R07/R09/R10 contracts.
-- Deliberately DOES NOT create a new dispatcher or fiscal issuer.
-- Old orders without R07 enrollment are governed by their existing policy.
-- For R07 orders, physical custody and route launch require R10 proof,
-- even when the old fiscal dispatch gate is in 'observe' mode.

CREATE OR REPLACE FUNCTION public.ops2_r11_has_dispatch_proof_v1(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $r11_proof$
  SELECT CASE
    WHEN p_order_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.orders o WHERE o.id=p_order_id
    ) THEN false
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_bling_r7_sync_intents_v1 i
      WHERE i.order_id=p_order_id
    ) THEN true -- historical orders retain their existing dispatch policy
    ELSE EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.order_bling_r7_sync_intents_v1 i
        ON i.order_id=o.id
      JOIN public.order_fiscal_r10_authorization_evidence_v1 e
        ON e.order_id=o.id
      JOIN public.dispatch_fiscal_jobs j
        ON j.order_id=o.id AND j.fiscal_version=1
      JOIN public.order_fiscal_controls c
        ON c.order_id=o.id
      WHERE o.id=p_order_id
        AND o.status IN ('ready','out_for_delivery','delivered')
        AND i.status='verified'
        AND i.bling_order_id=e.bling_order_id
        AND e.status='authorized' AND e.sefaz_cstat IN (100,150)
        AND j.status='authorized'
        AND j.bling_order_id=e.bling_order_id
        AND j.bling_invoice_id=e.bling_invoice_id
        AND j.access_key=e.access_key
        AND c.dispatch_fiscal_status='authorized'
        AND c.bling_invoice_id=e.bling_invoice_id
        AND c.sefaz_status=e.sefaz_cstat::text
    )
  END;
$r11_proof$;

CREATE OR REPLACE FUNCTION public.ops2_r11_guard_delivery_custody_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r11_custody$
DECLARE
  v_releasing boolean:=false;
BEGIN
  IF TG_OP='INSERT' THEN
    v_releasing:=NEW.status IN ('out_for_delivery','delivered')
      OR NEW.loaded_at IS NOT NULL
      OR NEW.custody_confirmed_at IS NOT NULL;
  ELSE
    v_releasing:=
      (NEW.status IN ('out_for_delivery','delivered')
        AND OLD.status IS DISTINCT FROM NEW.status)
      OR (NEW.loaded_at IS NOT NULL AND OLD.loaded_at IS NULL)
      OR (NEW.custody_confirmed_at IS NOT NULL
        AND OLD.custody_confirmed_at IS NULL);
  END IF;

  IF v_releasing AND NOT public.ops2_r11_has_dispatch_proof_v1(NEW.order_id)
  THEN
    RAISE EXCEPTION 'r11_sefaz_proof_required_before_custody:%',NEW.order_id
      USING ERRCODE='P0001',
      HINT='Mantenha a entrega planejada, valide o documento no Bling/SEFAZ e tente novamente.';
  END IF;
  RETURN NEW;
END;
$r11_custody$;

DROP TRIGGER IF EXISTS trg_ops2_r11_guard_delivery_custody
  ON public.ops_delivery_stops;
CREATE TRIGGER trg_ops2_r11_guard_delivery_custody
  BEFORE INSERT OR UPDATE OF status,loaded_at,custody_confirmed_at
  ON public.ops_delivery_stops
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r11_guard_delivery_custody_v1();

CREATE OR REPLACE FUNCTION public.ops2_r11_guard_delivery_run_dispatch_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r11_run$
BEGIN
  IF NEW.status='dispatched'
    AND OLD.status IS DISTINCT FROM 'dispatched'
    AND EXISTS (
      SELECT 1 FROM public.ops_delivery_stops s
      WHERE s.run_id=NEW.id
        AND s.status NOT IN ('cancelled','failed')
        AND NOT public.ops2_r11_has_dispatch_proof_v1(s.order_id)
    )
  THEN
    RAISE EXCEPTION 'r11_route_contains_unapproved_fiscal_order:%',NEW.id
      USING ERRCODE='P0001',
      HINT='Remova ou regularize a entrega sem NF-e autorizada antes de despachar o veículo.';
  END IF;
  RETURN NEW;
END;
$r11_run$;

DROP TRIGGER IF EXISTS trg_ops2_r11_guard_delivery_run_dispatch
  ON public.ops_delivery_runs;
CREATE TRIGGER trg_ops2_r11_guard_delivery_run_dispatch
  BEFORE UPDATE OF status ON public.ops_delivery_runs
  FOR EACH ROW EXECUTE FUNCTION public.ops2_r11_guard_delivery_run_dispatch_v1();

REVOKE ALL ON FUNCTION public.ops2_r11_has_dispatch_proof_v1(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r11_guard_delivery_custody_v1()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops2_r11_guard_delivery_run_dispatch_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_r11_has_dispatch_proof_v1(uuid)
  TO service_role;
