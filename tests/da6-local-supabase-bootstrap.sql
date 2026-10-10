-- DA6 R6: somente no Supabase LOCAL descartável iniciado no GitHub Actions.
-- Todas as tabelas são artificiais; sem alterar o Supabase canônico.
\set ON_ERROR_STOP on
CREATE TABLE public.products (id uuid PRIMARY KEY);
CREATE TABLE public.admin_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 role text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 display_name text
);
CREATE TABLE public.inventory_label_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 operator text NOT NULL DEFAULT 'QA',
 total_files integer NOT NULL CHECK(total_files BETWEEN 1 AND 100)
);
CREATE TABLE public.inventory_label_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.inventory_label_batches(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 storage_path text NOT NULL,
 file_name text NOT NULL,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL,
 sha256 text NOT NULL,
 status text NOT NULL DEFAULT 'uploading',
 attempts smallint NOT NULL DEFAULT 0,
 claimed_at timestamptz,
 next_attempt_at timestamptz,
 finished_at timestamptz,
 error_code text,
 error_detail text,
 parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 claim_token uuid
);
CREATE TABLE public.inventory_label_counts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 photo_id uuid NOT NULL REFERENCES public.inventory_label_photos(id),
 batch_id uuid NOT NULL REFERENCES public.inventory_label_batches(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 label_serial text NOT NULL,
 balance_slot smallint NOT NULL,
 quantity smallint NOT NULL,
 confidence numeric NOT NULL,
 status text NOT NULL DEFAULT 'pending_review',
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(label_serial,balance_slot)
);
ALTER TABLE public.inventory_label_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_label_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_label_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_label_batches,public.inventory_label_photos,
 public.inventory_label_counts,public.products,public.admin_users FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.inventory_label_batches,public.inventory_label_photos,
 public.inventory_label_counts,public.products,public.admin_users TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
