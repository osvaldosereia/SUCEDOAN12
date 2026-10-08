-- Reconstructed idempotently from the canonical database catalog (2026-10-08).
-- Version already recorded in the canonical migration history; retain this file
-- so fresh environments receive the same destination/custody invariants.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ops_delivery_stops'::regclass
      AND conname = 'smart_delivery_valid_destination_v1'
  ) THEN
    ALTER TABLE public.ops_delivery_stops
      ADD CONSTRAINT smart_delivery_valid_destination_v1
      CHECK (
        (destination_latitude IS NULL AND destination_longitude IS NULL)
        OR (
          destination_latitude BETWEEN -90 AND 90
          AND destination_longitude BETWEEN -180 AND 180
          AND (destination_latitude <> 0 OR destination_longitude <> 0)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ops_delivery_stops'::regclass
      AND conname = 'smart_delivery_custody_pair_v1'
  ) THEN
    ALTER TABLE public.ops_delivery_stops
      ADD CONSTRAINT smart_delivery_custody_pair_v1
      CHECK (
        (loaded_at IS NULL AND custody_confirmed_at IS NULL)
        OR (loaded_at IS NOT NULL AND custody_confirmed_at IS NOT NULL)
      );
  END IF;
END $$;
