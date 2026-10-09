-- R02+R03 synthetic bridge. PostgreSQL 17 EPHEMERAL only.
-- Initializes ONLY dependencies absent from the R02 fixture so that the
-- *real* checkout v3_base executes with the R03 immutable weekly code trigger.
\set ON_ERROR_STOP on
CREATE UNIQUE INDEX orders_order_number_uq ON public.orders(order_number)
 WHERE order_number IS NOT NULL;

CREATE SEQUENCE public.order_public_code_seq_v1;
CREATE FUNCTION public.ops2_format_order_public_code_v1(p_seq bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $format$
 SELECT 'AA'||lpad((p_seq%1000)::text,3,'0')
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

-- Mimics the existing snapshot refresh function, not the real production
-- snapshot serializer. The identity trigger is the REAL R03 migration.
CREATE FUNCTION public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $refresh$
DECLARE v jsonb;
BEGIN
 SELECT jsonb_build_object('version',3,'item_count',count(*)) INTO v
 FROM public.order_items WHERE order_id=p_order_id;
 INSERT INTO public.order_public_snapshots_v1(order_id,snapshot)
 VALUES(p_order_id,v)
 ON CONFLICT(order_id) DO UPDATE SET snapshot=EXCLUDED.snapshot;
 RETURN v;
END $refresh$;

-- The R03 migration replaces this body; the constraint trigger itself is
-- real in the current DB and must be present to exercise deferred refresh.
CREATE FUNCTION public.ops2_order_item_public_snapshot_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $legacy$
BEGIN
 IF EXISTS(SELECT 1 FROM public.order_public_snapshots_v1
    WHERE order_id=NEW.order_id) THEN RETURN NEW; END IF;
 PERFORM public.ops2_refresh_order_public_snapshot_v1(NEW.order_id);
 RETURN NEW;
END $legacy$;
CREATE CONSTRAINT TRIGGER trg_order_item_public_snapshot_v1
 AFTER INSERT ON public.order_items DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.ops2_order_item_public_snapshot_trigger_v1();
