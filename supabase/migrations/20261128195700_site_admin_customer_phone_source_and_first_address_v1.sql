-- Keep the client phone source compatible with the current CHECK constraint,
-- and make a customer's first address the default.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.ops2_site_admin_customer_update_v3(uuid,timestamptz,text,uuid,timestamptz,jsonb,text,text)'::regprocedure
  );
  v_constraint text := (
    SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
    WHERE c.conrelid='public.customer_phones'::regclass AND c.conname='customer_phones_source_check'
  );
  v_old text[] := ARRAY[
    $old$values(p_customer_id,v_phone,'site_admin_code',true);$old$,
    $old$v_postal_code, v_reference, false, true, v_now$old$
  ];
  v_new text[] := ARRAY[
    $new$values(p_customer_id,v_phone,'vitrine_admin',true);$new$,
    $new$v_postal_code, v_reference, not exists(
        select 1 from public.customer_addresses existing_address
        where existing_address.customer_id=p_customer_id and existing_address.is_active=true
      ), true, v_now$new$
  ];
  i integer;
BEGIN
  IF position('''vitrine_admin''' in coalesce(v_constraint,''))=0 THEN
    RAISE EXCEPTION 'customer phone source constraint changed';
  END IF;
  FOR i IN 1..array_length(v_old,1) LOOP
    IF length(v_definition)-length(replace(v_definition,v_old[i],''))<>length(v_old[i]) THEN
      RAISE EXCEPTION 'customer update patch: unexpected section %',i;
    END IF;
    v_definition:=replace(v_definition,v_old[i],v_new[i]);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;
