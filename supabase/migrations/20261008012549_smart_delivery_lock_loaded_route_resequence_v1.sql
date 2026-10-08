-- Mirror canonical 20261008012549. A loaded parcel may never be
-- silently resequenced or transferred to another driver/route.
CREATE OR REPLACE FUNCTION public.smart_delivery_guard_route_resequence_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public'
AS $$
DECLARE
  v_source public.ops_delivery_runs%rowtype;
  v_target public.ops_delivery_runs%rowtype;
BEGIN
  IF new.run_id IS NOT DISTINCT FROM old.run_id
     AND new.sequence IS NOT DISTINCT FROM old.sequence THEN
    RETURN new;
  END IF;
  SELECT * INTO v_source FROM public.ops_delivery_runs WHERE id=old.run_id;
  IF v_source.status <> 'planned' OR v_source.loading_started_at IS NOT NULL
     OR v_source.loaded_at IS NOT NULL OR old.loaded_at IS NOT NULL
     OR old.custody_confirmed_at IS NOT NULL OR old.status <> 'planned'
  THEN RAISE EXCEPTION 'smart_delivery_route_locked_after_loading'; END IF;
  IF new.run_id IS DISTINCT FROM old.run_id THEN
    SELECT * INTO v_target FROM public.ops_delivery_runs WHERE id=new.run_id;
    IF v_target.status <> 'planned' OR v_target.loading_started_at IS NOT NULL
       OR v_target.loaded_at IS NOT NULL
    THEN RAISE EXCEPTION 'smart_delivery_target_route_locked'; END IF;
  END IF;
  RETURN new;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.ops_delivery_stops'::regclass
      AND tgname='smart_delivery_guard_route_resequence_v1'
  ) THEN
    CREATE TRIGGER smart_delivery_guard_route_resequence_v1
      BEFORE UPDATE OF run_id, sequence ON public.ops_delivery_stops
      FOR EACH ROW EXECUTE FUNCTION public.smart_delivery_guard_route_resequence_v1();
  END IF;
END $$;
