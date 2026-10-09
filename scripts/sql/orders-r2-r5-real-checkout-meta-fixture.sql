-- R02/R03/R04/R05 joint PG17 fixture, NO real Meta/Bling/SEFAZ traffic.
-- Depends on R02 base checkout+reservation and the exact pinned R03 migration.
\set ON_ERROR_STOP on
ALTER TABLE public.orders
  ADD COLUMN whatsapp_account_id uuid,
  ADD COLUMN conversation_id uuid,
  ADD COLUMN cancelled_at timestamptz;
CREATE TABLE public.whatsapp_accounts(
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL
);
ALTER TABLE public.orders ADD CONSTRAINT orders_whatsapp_account_fk
  FOREIGN KEY(whatsapp_account_id) REFERENCES public.whatsapp_accounts(id);
CREATE TABLE public.whatsapp_messages_v1 (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id),
  direction text NOT NULL, message_type text NOT NULL,
  provider text NOT NULL, provider_message_id text,
  sender_kind text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops2_whatsapp_outbox_v1(
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id),
  conversation_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  status text NOT NULL,
  recipient_kind text NOT NULL,
  message_kind text NOT NULL,
  delivery_mode text NOT NULL,
  channel_origin text NOT NULL,
  external_message_id text,
  sent_at timestamptz
);
CREATE TABLE public.order_separation_assignments_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  separator_key text NOT NULL
);
CREATE TABLE public.order_separation_items_v1 (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  state text NOT NULL DEFAULT 'pending',
  quantity numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.order_separation_completions_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  final_total numeric NOT NULL,
  phase text NOT NULL DEFAULT 'prepared',
  completed_at timestamptz
);
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $auth$
  SELECT '60000000-0000-4000-8000-000000000001'::uuid
$auth$;
CREATE TABLE public.admin_users(
 user_id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.admin_users(user_id,is_active)
VALUES ('60000000-0000-4000-8000-000000000001',true);
GRANT USAGE ON SCHEMA public TO service_role;

INSERT INTO public.whatsapp_accounts(id,phone_e164) VALUES
('00000000-0000-4000-8000-000000000975','+5565999990975'),
('00000000-0000-4000-8000-000000001018','+5565999991018');

-- This admin-checked test queue uses REAL checkout orders and their R03
-- public code, rather than R05's earlier hard-coded mocked order numbers.
CREATE OR REPLACE FUNCTION public.manual_pick_queue_feed_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $queue$
 SELECT jsonb_build_object(
   'ok',true,'orders',
   coalesce(jsonb_agg(jsonb_build_object(
     'id',o.id,'public_code',o.order_number,'status',o.status)
     ORDER BY o.created_at,o.id),'[]'::jsonb))
 FROM public.orders o
 WHERE o.source='vitrine'
$queue$;

-- Orders are created by the real checkout + R03 weekly trigger, then associated
-- with fictitious Meta conversations and outbound template WAMIDs.
CREATE TABLE public.r2_r5_meta_test_orders (
  kind text PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  account_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  inbound_id uuid NOT NULL
);
DO $build_test_orders$
DECLARE a jsonb; oid uuid;
BEGIN
  a:=public.create_vitrine_cart_order_v3(null,'PIX',
    '[{"type":"product","id":"00000000-0000-4000-8000-0000000000aa","qty":2}]'::jsonb);
  oid:=(a->>'order_id')::uuid;
  IF (a->>'total')::numeric IS DISTINCT FROM 100
    OR a->>'order_number' IS DISTINCT FROM
      (SELECT order_number FROM public.orders WHERE id=oid)
  THEN RAISE EXCEPTION 'actual simple checkout number mismatched %',a; END IF;
  INSERT INTO public.r2_r5_meta_test_orders VALUES(
    'simple',oid,'00000000-0000-4000-8000-000000000975',
    '20000000-0000-4000-8000-000000000001','+5565991111111',
    '40000000-0000-4000-8000-000000000001');

  a:=public.create_vitrine_cart_order_v3(null,'PIX',jsonb_build_array(jsonb_build_object(
    'type','basket','id','00000000-0000-4000-8000-0000000000d1',
    'food_lot_id','00000000-0000-4000-8000-0000000000f1',
    'components',jsonb_build_array(
      jsonb_build_object('component_group','food','product_id',
        '00000000-0000-4000-8000-0000000000e1','quantity',1),
      jsonb_build_object('component_group','hygiene','product_id',
        '00000000-0000-4000-8000-0000000000e2','quantity',1)))));
  oid:=(a->>'order_id')::uuid;
  IF (a->>'total')::numeric IS DISTINCT FROM 160 OR
    a->>'order_number' IS DISTINCT FROM
      (SELECT order_number FROM public.orders WHERE id=oid)
  THEN RAISE EXCEPTION 'actual basket checkout mismatched %',a; END IF;
  INSERT INTO public.r2_r5_meta_test_orders VALUES(
    'basket',oid,'00000000-0000-4000-8000-000000001018',
    '20000000-0000-4000-8000-000000000002','+5565992222222',
    '40000000-0000-4000-8000-000000000002');

  a:=public.create_vitrine_cart_order_v3(null,'PIX',jsonb_build_array(jsonb_build_object(
    'type','basket_mold','id','00000000-0000-4000-8000-0000000000d3',
    'components',jsonb_build_array(
      jsonb_build_object('position_id','00000000-0000-4000-8000-0000000000c2',
        'product_id','00000000-0000-4000-8000-0000000000e3','quantity',1),
      jsonb_build_object('position_id','00000000-0000-4000-8000-0000000000c3',
        'product_id','00000000-0000-4000-8000-0000000000e4','quantity',1)))));
  oid:=(a->>'order_id')::uuid;
  IF (a->>'total')::numeric IS DISTINCT FROM 100
  THEN RAISE EXCEPTION 'actual mold checkout failed %',a; END IF;
  INSERT INTO public.r2_r5_meta_test_orders VALUES(
    'mold',oid,'00000000-0000-4000-8000-000000000975',
    '20000000-0000-4000-8000-000000000003','+5565993333333',
    '40000000-0000-4000-8000-000000000003');
END $build_test_orders$;

UPDATE public.orders o
SET whatsapp_account_id=t.account_id,
  conversation_id=t.conversation_id,
  phone_e164=t.phone_e164,status='confirmed'
FROM public.r2_r5_meta_test_orders t WHERE o.id=t.order_id;

INSERT INTO public.ops2_whatsapp_outbox_v1(
  id,order_id,whatsapp_account_id,conversation_id,phone_e164,
  status,recipient_kind,message_kind,delivery_mode,channel_origin,
  external_message_id,sent_at)
SELECT (CASE t.kind WHEN 'simple' THEN
 '30000000-0000-4000-8000-000000000001'::uuid
 WHEN 'basket' THEN '30000000-0000-4000-8000-000000000002'::uuid
 ELSE '30000000-0000-4000-8000-000000000003'::uuid END),
 t.order_id,t.account_id,t.conversation_id,t.phone_e164,
 'sent','customer','order_received','utility_template',
 CASE WHEN t.kind='basket' THEN '1018' ELSE '0975' END,
 'wamid.SYNTHETIC_OUTBOUND_'||t.kind,now()-interval '2 minutes'
FROM public.r2_r5_meta_test_orders t;

INSERT INTO public.whatsapp_messages_v1(
  id,conversation_id,whatsapp_account_id,direction,message_type,provider,
  provider_message_id,sender_kind,received_at,metadata)
SELECT t.inbound_id,t.conversation_id,t.account_id,
 'inbound','button','meta','wamid.SYNTHETIC_INBOUND_'||t.kind,
 'customer',now(),jsonb_build_object(
   'source_event','messages',
   'context_message_id','wamid.SYNTHETIC_OUTBOUND_'||t.kind,
   'order_meta_confirmation',jsonb_build_object(
     'button_id','CONFIRMADO',
     'outbound_wamid','wamid.SYNTHETIC_OUTBOUND_'||t.kind,
     'signature_verified',true,
     'source','signed_meta_webhook'))
FROM public.r2_r5_meta_test_orders t;

-- A text message containing the same confirmation metadata is NEVER an
-- eligible button. Also reject cross-channel replay from another account.
INSERT INTO public.whatsapp_messages_v1(
  id,conversation_id,whatsapp_account_id,direction,message_type,provider,
  provider_message_id,sender_kind,received_at,metadata)
VALUES
('40000000-0000-4000-8000-000000000004',
 '20000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000975',
 'inbound','text','meta','wamid.FAKE_TEXT','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_simple","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_simple","signature_verified":true,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000005',
 '20000000-0000-4000-8000-000000000002',
 '00000000-0000-4000-8000-000000000975',
 'inbound','button','meta','wamid.FAKE_ACCOUNT','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_basket","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_basket","signature_verified":true,"source":"signed_meta_webhook"}}');
