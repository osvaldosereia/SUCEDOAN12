-- Mirror canonical 20261008012500. Route optimization swaps stop positions
-- in a single transaction; uniqueness must be checked at transaction end.
DO $$
DECLARE v_deferrable boolean;
BEGIN
  SELECT condeferrable INTO v_deferrable
  FROM pg_constraint
  WHERE conrelid='public.ops_delivery_stops'::regclass
    AND conname='ops_delivery_stops_run_id_sequence_key';
  IF v_deferrable IS DISTINCT FROM TRUE THEN
    ALTER TABLE public.ops_delivery_stops
      DROP CONSTRAINT IF EXISTS ops_delivery_stops_run_id_sequence_key;
    ALTER TABLE public.ops_delivery_stops
      ADD CONSTRAINT ops_delivery_stops_run_id_sequence_key
      UNIQUE (run_id, sequence) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
