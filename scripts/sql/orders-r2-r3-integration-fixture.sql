-- R02+R03 integration laboratory. Schema additions for the ORIGINAL R03 migration.
-- Loads AFTER R02 checkout basket fixture, BEFORE R03 migration.
-- Production: DO NOT RUN. No customer data or external services.
\set ON_ERROR_STOP on

-- R03's historical format remains readable, but brand-new customer orders
-- receive weekly codes directly from BEFORE INSERT on public.orders.
CREATE SEQUENCE public.order_public_code_seq_v1;
CREATE OR REPLACE FUNCTION public.ops2_format_order_public_code_v1(p_seq bigint)
 RETURNS text LANGUAGE sql IMMUTABLE AS $format$
 SELECT 'AA'||lpad((p_seq % 1000)::text,3,'0')
 $format$;

CREATE TABLE public.order_public_snapshots_v1(
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 public_code text NOT NULL DEFAULT 'AA999',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_public_snapshots_v1
 ADD CONSTRAINT order_public_snapshots_v1_public_code_format_chk
 CHECK(public_code ~ '^[A-Z]{2}[0-9]{3}$');
CREATE UNIQUE INDEX order_public_snapshots_v1_public_code_uidx
 ON public.order_public_snapshots_v1(public_code);
CREATE UNIQUE INDEX orders_order_number_uq
 ON public.orders(order_number) WHERE order_number IS NOT NULL;

-- This reproduces the pre-R03 snapshot refresh dependency that the migration
-- intentionally fixes. The enhanced R03 trigger executes at transaction end.
CREATE OR REPLACE FUNCTION public.ops2_refresh_order_public_snapshot_v1(
 p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $refresh$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('version',3,'item_count',count(*))
 INTO result FROM public.order_items WHERE order_id=p_order_id;
 INSERT INTO public.order_public_snapshots_v1(order_id,snapshot)
 VALUES(p_order_id,result)
 ON CONFLICT(order_id) DO UPDATE SET snapshot=EXCLUDED.snapshot;
 RETURN result;
END $refresh$;
CREATE OR REPLACE FUNCTION public.ops2_order_item_public_snapshot_trigger_v1()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $legacy$
BEGIN
 IF EXISTS(SELECT 1 FROM public.order_public_snapshots_v1 WHERE order_id=NEW.order_id)
 THEN RETURN NEW; END IF;
 PERFORM public.ops2_refresh_order_public_snapshot_v1(NEW.order_id);
 RETURN NEW;
END $legacy$;
CREATE CONSTRAINT TRIGGER trg_order_item_public_snapshot_v1
 AFTER INSERT ON public.order_items DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.ops2_order_item_public_snapshot_trigger_v1();

-- Synthetic historical order before the NEW weekly-number triggers exist.
INSERT INTO public.orders(id,status,source,order_number,total,subtotal)
 VALUES('00000000-0000-4000-8000-000000000099','ready','bling_import',
        'AA001',100,100);
INSERT INTO public.order_public_snapshots_v1(order_id,snapshot,public_code)
 VALUES('00000000-0000-4000-8000-000000000099','{"legacy":true}'::jsonb,'AA001');

GRANT USAGE ON SCHEMA public TO service_role;
