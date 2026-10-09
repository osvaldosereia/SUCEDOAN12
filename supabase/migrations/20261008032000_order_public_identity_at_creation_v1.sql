-- DRAFT R03: replace the unmerged four-digit public identity proposal with
-- immutable weekly code DD|MM|YYYY - NNN in timezone America/Cuiaba.
-- Apply ONLY after CI and dedicated staging approval. NEVER replay onto prod.
-- The weekly sequence resets on Mondays but displayed date is the local order
-- creation date; a single counter advances through each Monday-Sunday week.
-- Historic AA001 and four-digit identities are NOT rewritten.
--
-- The real canonical orders.order_number exists and is UNIQUE when non-null.
-- The real canonical order_public_snapshots_v1.public_code is UNIQUE.
-- The same immutable identity is used in both fields at order INSERT time.

CREATE TABLE IF NOT EXISTS public.order_public_weekly_counters_v1 (
  week_start date PRIMARY KEY,
  last_seq integer NOT NULL CHECK (last_seq BETWEEN 1 AND 999),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_public_weekly_counters_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_public_weekly_counters_v1 FROM PUBLIC, anon, authenticated;
-- No client-side insert/update/select; allocation goes through a restricted
-- server function. A concurrent ON CONFLICT update serializes each week.

CREATE OR REPLACE FUNCTION public.ops2_next_order_public_code_weekly_v1(
  p_at timestamptz DEFAULT clock_timestamp()
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $weekly$
DECLARE
  v_date date;
  v_week date;
  v_seq integer;
BEGIN
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'order_public_code_timestamp_required';
  END IF;
  v_date := (p_at AT TIME ZONE 'America/Cuiaba')::date;
  v_week := v_date - (extract(isodow FROM v_date)::integer - 1);
  INSERT INTO public.order_public_weekly_counters_v1 (week_start,last_seq)
    VALUES(v_week,1)
  ON CONFLICT (week_start)
    DO UPDATE SET last_seq=public.order_public_weekly_counters_v1.last_seq+1,
                  updated_at=clock_timestamp()
  RETURNING last_seq INTO v_seq;
  IF v_seq > 999 THEN
    RAISE EXCEPTION 'order_public_week_capacity_exhausted';
  END IF;
  RETURN to_char(v_date,'DD|MM|YYYY') || ' - ' || lpad(v_seq::text,3,'0');
END
$weekly$;
REVOKE ALL ON FUNCTION public.ops2_next_order_public_code_weekly_v1(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_next_order_public_code_weekly_v1(timestamptz)
  TO service_role;

-- Default consumption on SNAPSHOT UPSERT is unsafe: the expression is evaluated
-- before ON CONFLICT even when the snapshot already has a public identity.
-- Resolve the existing identity first, never allocate a second sales number.
ALTER TABLE public.order_public_snapshots_v1
  DROP CONSTRAINT IF EXISTS order_public_snapshots_v1_public_code_format_chk;
ALTER TABLE public.order_public_snapshots_v1
  ADD CONSTRAINT order_public_snapshots_v1_public_code_format_chk
  CHECK (
    public_code ~ '^[A-Z]{2}[0-9]{3}$'
    OR public_code ~ '^[0-9]{4}$'
    OR public_code ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
  );
ALTER TABLE public.order_public_snapshots_v1 ALTER COLUMN public_code DROP DEFAULT;

-- Only actual customer-facing order sources receive the new date format.
-- Imported Bling orders and legacy records retain their existing identifiers.
-- This BEFORE INSERT trigger also prevents spoofing by input order_number.
CREATE OR REPLACE FUNCTION public.ops2_assign_order_weekly_number_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $assign$
BEGIN
  IF NEW.source IN ('vitrine','storefront_v2','manual_whatsapp','papoai','reorder') THEN
    NEW.order_number := public.ops2_next_order_public_code_weekly_v1(clock_timestamp());
  END IF;
  RETURN NEW;
END
$assign$;
REVOKE ALL ON FUNCTION public.ops2_assign_order_weekly_number_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_assign_order_weekly_number_v1 ON public.orders;
CREATE TRIGGER trg_ops2_assign_order_weekly_number_v1
BEFORE INSERT ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.ops2_assign_order_weekly_number_v1();

-- A created weekly identity cannot be replaced later by admin/other workflows.
CREATE OR REPLACE FUNCTION public.ops2_guard_order_weekly_number_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $guard$
BEGIN
  IF OLD.order_number ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'
     AND NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'order_public_identity_immutable';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.ops2_guard_order_weekly_number_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_guard_order_weekly_number_v1 ON public.orders;
CREATE TRIGGER trg_ops2_guard_order_weekly_number_v1
BEFORE UPDATE OF order_number ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.ops2_guard_order_weekly_number_v1();

-- Snapshot UPSERT refresh: return the existing code (including historical),
-- otherwise inherit orders.order_number. Imported orders still use the
-- previous legacy sequence if there is no order_number.
CREATE OR REPLACE FUNCTION public.ops2_resolve_snapshot_public_identity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $snapshot$
DECLARE
  v_existing text;
  v_order_number text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.order_id::text,0));
  SELECT s.public_code INTO v_existing
    FROM public.order_public_snapshots_v1 s WHERE s.order_id=NEW.order_id;
  IF v_existing IS NOT NULL THEN
    NEW.public_code := v_existing;
    RETURN NEW;
  END IF;
  SELECT o.order_number INTO v_order_number FROM public.orders o WHERE o.id=NEW.order_id;
  IF v_order_number IS NOT NULL THEN
    NEW.public_code := v_order_number;
  ELSIF NEW.public_code IS NULL THEN
    NEW.public_code := public.ops2_format_order_public_code_v1(
      nextval('public.order_public_code_seq_v1'::regclass)
    );
  END IF;
  RETURN NEW;
END
$snapshot$;
REVOKE ALL ON FUNCTION public.ops2_resolve_snapshot_public_identity_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_resolve_snapshot_public_identity_v1
  ON public.order_public_snapshots_v1;
CREATE TRIGGER trg_ops2_resolve_snapshot_public_identity_v1
BEFORE INSERT ON public.order_public_snapshots_v1 FOR EACH ROW
EXECUTE FUNCTION public.ops2_resolve_snapshot_public_identity_v1();

-- AFTER INSERT stores the SAME order_number immediately in the public
-- snapshot, so the Meta template, Admin and picker do not create identifiers.
CREATE OR REPLACE FUNCTION public.ops2_assign_order_public_identity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $order_snapshot$
BEGIN
  IF NEW.order_number IS NOT NULL
     AND NEW.order_number ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$' THEN
    INSERT INTO public.order_public_snapshots_v1(order_id,snapshot,public_code)
    VALUES(NEW.id,'{}'::jsonb,NEW.order_number)
    ON CONFLICT(order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$order_snapshot$;
REVOKE ALL ON FUNCTION public.ops2_assign_order_public_identity_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_assign_order_public_identity_v1 ON public.orders;
CREATE TRIGGER trg_ops2_assign_order_public_identity_v1
AFTER INSERT ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.ops2_assign_order_public_identity_v1();

CREATE OR REPLACE FUNCTION public.ops2_guard_order_public_identity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $guard_snapshot$
BEGIN
  IF TG_OP='UPDATE' AND (
     NEW.public_code IS DISTINCT FROM OLD.public_code
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
  ) THEN
    RAISE EXCEPTION 'order_public_identity_immutable';
  END IF;
  RETURN NEW;
END
$guard_snapshot$;
REVOKE ALL ON FUNCTION public.ops2_guard_order_public_identity_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_guard_order_public_identity_v1
  ON public.order_public_snapshots_v1;
CREATE TRIGGER trg_ops2_guard_order_public_identity_v1
BEFORE UPDATE ON public.order_public_snapshots_v1 FOR EACH ROW
EXECUTE FUNCTION public.ops2_guard_order_public_identity_v1();

-- The deferred order-item trigger previously skipped building line items
-- because a placeholder public snapshot already existed at order INSERT.
-- Refresh its content once while preserving the immutable identity.
CREATE OR REPLACE FUNCTION public.ops2_order_item_public_snapshot_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,pg_temp
AS $public_snapshot$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.order_public_snapshots_v1 s
    WHERE s.order_id=NEW.order_id AND s.snapshot <> '{}'::jsonb
  ) THEN
    RETURN NEW;
  END IF;
  PERFORM public.ops2_refresh_order_public_snapshot_v1(NEW.order_id);
  RETURN NEW;
END
$public_snapshot$;

COMMENT ON COLUMN public.order_public_snapshots_v1.public_code IS
  'Immutable customer order code DD|MM|YYYY - NNN, weekly reset Mondays America/Cuiaba; historical codes preserved.';
