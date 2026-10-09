-- R02: isolated synthetic contract laboratory. Never run against a customer database.
-- This is NOT the full canonical schema or production RPC implementation.
\set ON_ERROR_STOP on
CREATE SCHEMA r2_hml;

CREATE TABLE r2_hml.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  public_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'storefront_received'
    CHECK (status IN ('storefront_received','confirmed','ready','cancelled')),
  total numeric(12,2) NOT NULL CHECK (total >= 0)
);
CREATE TABLE r2_hml.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES r2_hml.orders(id),
  sku text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  separated_qty numeric(12,3),
  CONSTRAINT separated_qty_bounds CHECK (
    separated_qty IS NULL OR (separated_qty >= 0 AND separated_qty <= quantity)
  )
);
CREATE TABLE r2_hml.confirmation_events (
  event_id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES r2_hml.orders(id),
  channel text NOT NULL CHECK (channel IN ('0975','1018')),
  button_id text NOT NULL,
  verified_signature boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r2_hml.order_separation_completions_v1 (
  order_id uuid PRIMARY KEY REFERENCES r2_hml.orders(id),
  final_total numeric(12,2) NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r2_hml.dispatch_fiscal_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES r2_hml.orders(id),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','reconcile','authorized','review_required')),
  generation_uncertain boolean NOT NULL DEFAULT false,
  invoice_id text,
  access_key text,
  sefaz_status text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz
);

-- This mock emulates atomic checkout uniqueness, not the live checkout RPC.
CREATE FUNCTION r2_hml.checkout_once(
  p_key text,p_public_code text,p_total numeric
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_order r2_hml.orders%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 OR p_total < 75 THEN
    RAISE EXCEPTION 'invalid_checkout';
  END IF;
  INSERT INTO r2_hml.orders(idempotency_key,public_code,total)
  VALUES (p_key,p_public_code,p_total)
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_order FROM r2_hml.orders WHERE idempotency_key=p_key;
  IF v_order.id IS NULL OR v_order.public_code<>p_public_code
     OR v_order.total<>p_total THEN
    RAISE EXCEPTION 'idempotency_payload_conflict';
  END IF;
  RETURN v_order.id;
END; $$;

-- This mock receives an ALREADY VERIFIED server-side Meta event.
-- The boolean is a synthetic test input, never a trust mechanism for production.
CREATE FUNCTION r2_hml.apply_verified_confirmation(
  p_order_id uuid,p_event_id text,p_channel text,
  p_button_id text,p_signature_verified boolean
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(p_signature_verified,false)
     OR p_button_id IS DISTINCT FROM 'CONFIRMADO'
     OR p_channel NOT IN ('0975','1018')
     OR length(coalesce(p_event_id,'')) < 8 THEN RETURN false; END IF;
  INSERT INTO r2_hml.confirmation_events
    (event_id,order_id,channel,button_id,verified_signature)
  VALUES(p_event_id,p_order_id,p_channel,p_button_id,true)
  ON CONFLICT(event_id) DO NOTHING;
  UPDATE r2_hml.orders SET status='confirmed'
  WHERE id=p_order_id AND status IN ('storefront_received','confirmed')
    AND EXISTS(
      SELECT 1 FROM r2_hml.confirmation_events e
      WHERE e.event_id=p_event_id AND e.order_id=p_order_id
        AND e.channel=p_channel AND e.verified_signature AND e.button_id='CONFIRMADO'
    );
  RETURN FOUND;
END; $$;

-- Synthetic separation; items have already been assigned separated_qty by staff.
CREATE FUNCTION r2_hml.finish_separation(p_order_id uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_total numeric(12,2); v_state text; v_pending integer;
BEGIN
  SELECT status INTO v_state FROM r2_hml.orders WHERE id=p_order_id FOR UPDATE;
  IF v_state IS DISTINCT FROM 'confirmed' AND v_state IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'customer_confirmation_required';
  END IF;
  SELECT count(*) FILTER (WHERE separated_qty IS NULL),
         coalesce(sum(separated_qty*unit_price),0)
  INTO v_pending,v_total FROM r2_hml.order_items WHERE order_id=p_order_id;
  IF v_pending > 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'invalid_final_separation';
  END IF;
  UPDATE r2_hml.orders SET total=v_total,status='ready' WHERE id=p_order_id;
  INSERT INTO r2_hml.order_separation_completions_v1(order_id,final_total)
  VALUES(p_order_id,v_total)
  ON CONFLICT(order_id) DO NOTHING;
  INSERT INTO r2_hml.dispatch_fiscal_jobs(order_id,idempotency_key)
  VALUES(p_order_id,'r2-fiscal:'||p_order_id::text)
  ON CONFLICT(order_id) DO NOTHING;
  RETURN v_total;
END; $$;

-- Claim is transactionally exclusive; a second worker must not send a second POST.
CREATE FUNCTION r2_hml.claim_fiscal_job() RETURNS bigint LANGUAGE sql AS $$
  WITH pick AS (
    SELECT id FROM r2_hml.dispatch_fiscal_jobs
    WHERE status='pending' ORDER BY id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE r2_hml.dispatch_fiscal_jobs j
  SET status='processing',attempts=j.attempts+1,claimed_at=now()
  FROM pick WHERE j.id=pick.id RETURNING j.id;
$$;
