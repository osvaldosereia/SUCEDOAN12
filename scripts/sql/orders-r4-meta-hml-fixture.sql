-- R04 CI ONLY: miniature canonical-shaped fixtures with FAKE Meta accounts.
-- No production data, credentials, transport or actual fiscal documents.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.whatsapp_accounts(
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL
);
CREATE TABLE public.orders(
  id uuid PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  phone_e164 text,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id),
  conversation_id uuid,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_messages_v1 (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id),
  direction text NOT NULL,
  message_type text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
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
  state text NOT NULL
);
CREATE TABLE public.order_separation_completions_v1 (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  final_total numeric NOT NULL
);

INSERT INTO public.whatsapp_accounts(id,phone_e164) VALUES
('00000000-0000-4000-8000-000000000975','+5565999990975'),
('00000000-0000-4000-8000-000000001018','+5565999991018');

INSERT INTO public.orders(id,source,phone_e164,whatsapp_account_id,conversation_id,created_at) VALUES
('10000000-0000-4000-8000-000000000001','vitrine','+5565991111111','00000000-0000-4000-8000-000000000975','20000000-0000-4000-8000-000000000001',now()),
('10000000-0000-4000-8000-000000000002','vitrine','+5565992222222','00000000-0000-4000-8000-000000001018','20000000-0000-4000-8000-000000000002',now()),
('10000000-0000-4000-8000-000000000003','bling_import','+5565993333333','00000000-0000-4000-8000-000000000975','20000000-0000-4000-8000-000000000003',now()-interval '5 days');

INSERT INTO public.ops2_whatsapp_outbox_v1
(id,order_id,whatsapp_account_id,conversation_id,phone_e164,status,recipient_kind,message_kind,delivery_mode,channel_origin,external_message_id,sent_at) VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000975','20000000-0000-4000-8000-000000000001','+5565991111111','sent','customer','order_received','utility_template','0975','wamid.SYNTHETIC_OUTBOUND_0975',now()-interval '2 minutes'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001018','20000000-0000-4000-8000-000000000002','+5565992222222','sent','customer','order_received','utility_template','1018','wamid.SYNTHETIC_OUTBOUND_1018',now()-interval '2 minutes');

INSERT INTO public.whatsapp_messages_v1
(id,conversation_id,whatsapp_account_id,direction,message_type,provider,provider_message_id,sender_kind,received_at,metadata)
VALUES
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000975','inbound','button','meta','wamid.SYNTHETIC_INBOUND_0975','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_0975","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_0975","signature_verified":true,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001018','inbound','interactive','meta','wamid.SYNTHETIC_INBOUND_1018','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_1018","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_1018","signature_verified":true,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000975','inbound','text','meta','wamid.FAKE_TEXT_CONFIRMED','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_0975","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_0975","signature_verified":true,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000975','inbound','button','meta','wamid.FAKE_UNSIGNED_REPLY','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_0975","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_0975","signature_verified":false,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000975','inbound','button','meta','wamid.FAKE_CROSS_CHANNEL','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.SYNTHETIC_OUTBOUND_1018","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.SYNTHETIC_OUTBOUND_1018","signature_verified":true,"source":"signed_meta_webhook"}}'),
('40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001018','inbound','button','meta','wamid.FAKE_CONTEXT','customer',now(),
 '{"source_event":"messages","context_message_id":"wamid.FAKE_UNKNOWN_TEMPLATE","order_meta_confirmation":{"button_id":"CONFIRMADO","outbound_wamid":"wamid.FAKE_UNKNOWN_TEMPLATE","signature_verified":true,"source":"signed_meta_webhook"}}');
