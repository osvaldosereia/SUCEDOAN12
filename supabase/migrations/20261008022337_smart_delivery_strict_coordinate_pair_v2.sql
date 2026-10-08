-- Reconcile the canonical coordinate-pair invariant for fresh installations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.ops_delivery_stops'::regclass
      AND conname='smart_delivery_coordinate_pair_v2'
  ) THEN
    ALTER TABLE public.ops_delivery_stops
      ADD CONSTRAINT smart_delivery_coordinate_pair_v2
      CHECK (
        (destination_latitude IS NULL AND destination_longitude IS NULL)
        OR (destination_latitude IS NOT NULL AND destination_longitude IS NOT NULL)
      );
  END IF;
END $$;
