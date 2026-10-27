-- A WhatsApp conversation may begin before the person's commercial name or
-- phone number is known. Do not fabricate one from the platform profile.
ALTER TABLE public.customers
  ALTER COLUMN full_name DROP NOT NULL;

CREATE TABLE public.customer_whatsapp_identities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_portfolio_id text NOT NULL,
  sender_id_type text NOT NULL,
  sender_id text NOT NULL,
  origin_waba_id text NOT NULL,
  origin_phone_number_id text NOT NULL,
  customer_id uuid,
  identity_source text DEFAULT 'meta_webhook'::text NOT NULL,
  link_method text,
  linked_at timestamp with time zone,
  linked_by uuid,
  first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_whatsapp_identities_pkey PRIMARY KEY (id),
  CONSTRAINT customer_whatsapp_identities_sender_type_check
    CHECK (sender_id_type = ANY (ARRAY['bsuid'::text, 'wa_id'::text])),
  CONSTRAINT customer_whatsapp_identities_sender_check
    CHECK (length(btrim(sender_id)) > 0),
  CONSTRAINT customer_whatsapp_identities_portfolio_check
    CHECK (length(btrim(business_portfolio_id)) > 0),
  CONSTRAINT customer_whatsapp_identities_waba_check
    CHECK (length(btrim(origin_waba_id)) > 0),
  CONSTRAINT customer_whatsapp_identities_phone_id_check
    CHECK (length(btrim(origin_phone_number_id)) > 0),
  CONSTRAINT customer_whatsapp_identities_source_check
    CHECK (identity_source = ANY (ARRAY['meta_webhook'::text, 'staff_verified_import'::text])),
  CONSTRAINT customer_whatsapp_identities_link_check
    CHECK (
      (customer_id IS NULL AND link_method IS NULL AND linked_at IS NULL AND linked_by IS NULL)
      OR
      (customer_id IS NOT NULL AND link_method IS NOT NULL AND link_method = ANY (ARRAY[
        'created_from_identity'::text,
        'customer_confirmed'::text,
        'staff_confirmed'::text,
        'verified_contact'::text
      ]) AND linked_at IS NOT NULL
        AND ((link_method = 'staff_confirmed' AND linked_by IS NOT NULL)
             OR link_method <> 'staff_confirmed'))
    ),
  CONSTRAINT customer_whatsapp_identities_seen_order_check
    CHECK (last_seen_at >= first_seen_at),
  CONSTRAINT customer_whatsapp_identities_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
  CONSTRAINT customer_whatsapp_identities_linked_by_fkey
    FOREIGN KEY (linked_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT customer_whatsapp_identities_business_sender_key
    UNIQUE (business_portfolio_id, sender_id_type, sender_id)
);

COMMENT ON TABLE public.customer_whatsapp_identities IS
  'WhatsApp sender identity scoped to a Meta business portfolio; phone and BSUID identities are never merged by guesswork.';
COMMENT ON COLUMN public.customer_whatsapp_identities.sender_id IS
  'Opaque WhatsApp sender identifier as received; bsuid corresponds to Meta user_id and is not a telephone number.';
COMMENT ON COLUMN public.customer_whatsapp_identities.origin_phone_number_id IS
  'Meta phone_number_id that first established the identity; conversation routing is stored separately.';

CREATE INDEX customer_whatsapp_identities_customer_id_idx
  ON public.customer_whatsapp_identities USING btree (customer_id)
  WHERE (customer_id IS NOT NULL);

ALTER TABLE public.customer_whatsapp_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.customer_whatsapp_identities FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.customer_whatsapp_identities TO service_role;
