-- R04 DRAFT / not deployed. Confirm WhatsApp Meta template quick-reply
-- against canonical inbound message + Meta outbound WAMID + account + conversation.
-- This file is for disposable PostgreSQL 17 CI first; generate a reviewed
-- Supabase migration via CLI only after sandbox compatibility is proven.
-- Never execute directly on production without the release gate.
CREATE TABLE IF NOT EXISTS public.order_meta_confirmations_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  inbound_message_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_messages_v1(id),
  outbox_id uuid NOT NULL REFERENCES public.ops2_whatsapp_outbox_v1(id),
  inbound_wamid text NOT NULL,
  outbound_wamid text NOT NULL,
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id),
  conversation_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL,
  proof_kind text NOT NULL DEFAULT 'meta_signed_quick_reply'
    CHECK (proof_kind='meta_signed_quick_reply'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_meta_confirmations_inbound_wamid_v1_idx
 ON public.order_meta_confirmations_v1(whatsapp_account_id,inbound_wamid);
ALTER TABLE public.order_meta_confirmations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_meta_confirmations_v1 FROM PUBLIC,anon,authenticated;

-- Flag is OFF until the Meta Utility template on BOTH channels is confirmed
-- to contain an approved quick reply and R04/R05 integration E2E passes.
CREATE TABLE IF NOT EXISTS public.order_meta_confirmation_runtime_v1 (
  id smallint PRIMARY KEY CHECK (id=1),
  enforce_new_orders boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enforce_new_orders OR enabled_at IS NOT NULL)
);
ALTER TABLE public.order_meta_confirmation_runtime_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_meta_confirmation_runtime_v1 FROM PUBLIC,anon,authenticated;
INSERT INTO public.order_meta_confirmation_runtime_v1(id,enforce_new_orders)
 VALUES(1,false) ON CONFLICT(id) DO NOTHING;

-- Service-role-only; requires a canonical inbound persisted AFTER a valid Meta
-- x-hub-signature-256 was verified by whatsapp-meta-webhook-v1.
-- A browser, ordinary text message, ANA action or guessed order number
-- cannot supply a valid Meta signed reply.
CREATE OR REPLACE FUNCTION public.ops2_apply_order_meta_confirmation_v1(
  p_inbound_message_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $apply$
DECLARE
  m public.whatsapp_messages_v1%rowtype;
  q public.ops2_whatsapp_outbox_v1%rowtype;
  o public.orders%rowtype;
  v_button jsonb;
  v_context text;
  v_inserted uuid;
  v_previous public.order_meta_confirmations_v1%rowtype;
  v_at timestamptz := clock_timestamp();
BEGIN
  IF p_inbound_message_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','inbound_message_id_required');
  END IF;
  SELECT * INTO m FROM public.whatsapp_messages_v1
    WHERE id=p_inbound_message_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','inbound_message_not_found');
  END IF;
  v_button:=m.metadata->'order_meta_confirmation';
  v_context:=m.metadata->>'context_message_id';
  IF m.provider IS DISTINCT FROM 'meta'
    OR m.direction IS DISTINCT FROM 'inbound'
    OR m.sender_kind IS DISTINCT FROM 'customer'
    OR m.message_type NOT IN ('button','interactive')
    OR m.metadata->>'source_event' IS DISTINCT FROM 'messages'
    OR v_button->>'button_id' IS DISTINCT FROM 'CONFIRMADO'
    OR v_button->>'source' IS DISTINCT FROM 'signed_meta_webhook'
    OR v_button->>'signature_verified' IS DISTINCT FROM 'true'
    OR v_button->>'outbound_wamid' IS DISTINCT FROM v_context
    OR v_context NOT LIKE 'wamid.%'
    OR m.provider_message_id NOT LIKE 'wamid.%'
  THEN RETURN jsonb_build_object('ok',false,'error','unverified_order_button'); END IF;

  -- One real Meta-sent template only; no silent fallback to arbitrary orders.
  SELECT * INTO q
    FROM public.ops2_whatsapp_outbox_v1
    WHERE external_message_id=v_context
      AND whatsapp_account_id=m.whatsapp_account_id
      AND conversation_id=m.conversation_id
      AND status='sent'
      AND recipient_kind='customer'
      AND message_kind='order_received'
      AND delivery_mode='utility_template'
      AND channel_origin IN ('0975','1018')
    ORDER BY sent_at DESC,id
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'matched',false,'reason','outbound_template_not_found');
  END IF;

  -- Never associate an old/delayed reply with a new order.
  IF q.sent_at IS NULL
     OR coalesce(m.received_at,m.created_at)<q.sent_at-interval '5 minutes'
     OR coalesce(m.received_at,m.created_at)>q.sent_at+interval '7 days' THEN
    RETURN jsonb_build_object('ok',false,'error','confirmation_outside_window');
  END IF;

  SELECT * INTO o FROM public.orders WHERE id=q.order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','order_not_found'); END IF;
  IF o.conversation_id IS NOT NULL AND o.conversation_id<>m.conversation_id THEN
    RETURN jsonb_build_object('ok',false,'error','order_conversation_mismatch');
  END IF;
  IF o.whatsapp_account_id IS NOT NULL AND o.whatsapp_account_id<>m.whatsapp_account_id THEN
    RETURN jsonb_build_object('ok',false,'error','order_account_mismatch');
  END IF;
  IF o.phone_e164 IS NOT NULL AND o.phone_e164<>q.phone_e164 THEN
    RETURN jsonb_build_object('ok',false,'error','order_customer_phone_mismatch');
  END IF;
  IF o.cancelled_at IS NOT NULL OR o.status IN ('cancelled','delivered','returned') THEN
    RETURN jsonb_build_object('ok',false,'error','order_no_longer_confirmable');
  END IF;
  IF o.source NOT IN ('vitrine','storefront_v2','manual_whatsapp','papoai','reorder') THEN
    RETURN jsonb_build_object('ok',false,'error','order_source_not_checkout');
  END IF;

  SELECT * INTO v_previous FROM public.order_meta_confirmations_v1
    WHERE order_id=o.id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'matched',true,'applied',false,'duplicate',true,
      'order_id',o.id,'status','already_confirmed');
  END IF;

  INSERT INTO public.order_meta_confirmations_v1(
    order_id,inbound_message_id,outbox_id,inbound_wamid,outbound_wamid,
    whatsapp_account_id,conversation_id,confirmed_at
  ) VALUES (
    o.id,m.id,q.id,m.provider_message_id,v_context,m.whatsapp_account_id,
    m.conversation_id,coalesce(m.received_at,v_at)
  ) ON CONFLICT(order_id) DO NOTHING
  RETURNING order_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok',true,'matched',true,'applied',false,'duplicate',true,'order_id',o.id);
  END IF;

  -- No movement of physical goods or NF-e; only a commercial confirmation.
  UPDATE public.orders SET
    confirmed_at=coalesce(confirmed_at,coalesce(m.received_at,v_at)),
    status=CASE WHEN status IN ('pending','pending_confirmation','awaiting_confirmation')
                THEN 'confirmed' ELSE status END,
    updated_at=v_at
  WHERE id=o.id;

  RETURN jsonb_build_object('ok',true,'matched',true,'applied',true,
    'order_id',o.id,'event_id',m.provider_message_id,'channel_origin',q.channel_origin,
    'status','customer_confirmed');
END
$apply$;
REVOKE ALL ON FUNCTION public.ops2_apply_order_meta_confirmation_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_apply_order_meta_confirmation_v1(uuid) TO service_role;

-- Runtime gate can be enabled only during a separate approved rollout.
-- Uses proof table, NEVER orders.status or text replies, as source of truth.
CREATE OR REPLACE FUNCTION public.ops2_meta_order_confirmation_required_v1(
  p_order_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $required$
  SELECT coalesce((
    SELECT r.enforce_new_orders
      AND o.created_at >= r.enabled_at
      AND o.source IN ('vitrine','storefront_v2','manual_whatsapp','papoai','reorder')
      AND NOT EXISTS(
        SELECT 1 FROM public.order_meta_confirmations_v1 c
        WHERE c.order_id=o.id
      )
    FROM public.orders o CROSS JOIN public.order_meta_confirmation_runtime_v1 r
    WHERE r.id=1 AND o.id=p_order_id
  ),false)
$required$;
REVOKE ALL ON FUNCTION public.ops2_meta_order_confirmation_required_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_meta_order_confirmation_required_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ops2_guard_order_meta_separation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $gate$
BEGIN
  IF public.ops2_meta_order_confirmation_required_v1(NEW.order_id) THEN
    RAISE EXCEPTION 'meta_customer_confirmation_required' USING errcode='P0001';
  END IF;
  RETURN NEW;
END
$gate$;
REVOKE ALL ON FUNCTION public.ops2_guard_order_meta_separation_v1()
  FROM PUBLIC,anon,authenticated;

-- Gate worker assignment, marking separated/missing, and finalization. The
-- status transition and other RPC paths must be re-audited with R05 before
-- the flag is turned on. Historical orders remain unaffected.
DROP TRIGGER IF EXISTS trg_ops2_order_meta_assignment_guard_v1
  ON public.order_separation_assignments_v1;
CREATE TRIGGER trg_ops2_order_meta_assignment_guard_v1
  BEFORE INSERT ON public.order_separation_assignments_v1 FOR EACH ROW
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

DROP TRIGGER IF EXISTS trg_ops2_order_meta_picking_guard_v1
  ON public.order_separation_items_v1;
CREATE TRIGGER trg_ops2_order_meta_picking_guard_v1
  BEFORE UPDATE OF state ON public.order_separation_items_v1 FOR EACH ROW
  WHEN (NEW.state IN ('separated','missing'))
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

DROP TRIGGER IF EXISTS trg_ops2_order_meta_completion_guard_v1
  ON public.order_separation_completions_v1;
CREATE TRIGGER trg_ops2_order_meta_completion_guard_v1
  BEFORE INSERT ON public.order_separation_completions_v1 FOR EACH ROW
  EXECUTE FUNCTION public.ops2_guard_order_meta_separation_v1();

-- Also prevent a direct order.status transition from bypassing picker/assignment
-- checks. The flag is default OFF and applies only to new customer orders.
CREATE OR REPLACE FUNCTION public.ops2_guard_order_meta_status_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $status_gate$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('processing','ready','out_for_delivery','delivered')
    AND public.ops2_meta_order_confirmation_required_v1(NEW.id) THEN
    RAISE EXCEPTION 'meta_customer_confirmation_required' USING errcode='P0001';
  END IF;
  RETURN NEW;
END
$status_gate$;
REVOKE ALL ON FUNCTION public.ops2_guard_order_meta_status_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_ops2_order_meta_status_guard_v1 ON public.orders;
CREATE TRIGGER trg_ops2_order_meta_status_guard_v1
  BEFORE UPDATE OF status ON public.orders FOR EACH ROW
  EXECUTE FUNCTION public.ops2_guard_order_meta_status_v1();
