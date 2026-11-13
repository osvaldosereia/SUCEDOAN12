DO $migration$
DECLARE
  v_proc oid;
  v_pattern text;
  v_replacement text;
  v_definition text;
  v_updated text;
BEGIN
  PERFORM set_config('check_function_bodies', 'off', true);

  FOR v_proc, v_pattern, v_replacement IN
    SELECT patch.proc, patch.pattern, patch.replacement
    FROM (VALUES
      ('public.whatsapp_order_flow_send_prepare_admin_v1(uuid,uuid,uuid)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active\s+is\s+true', ''),
      ('public.whatsapp_order_intent_confirm_v1(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text)'::regprocedure::oid,
        '\s+or\s+not\s+v_product\.is_whatsapp_active', ''),
      ('public.whatsapp_order_intent_ingest_v1(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,jsonb,uuid,uuid,text)'::regprocedure::oid,
        '\s+and\s+p\.is_whatsapp_active', ''),
      ('public.whatsapp_order_intent_ingest_v1(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,jsonb,uuid,uuid,text)'::regprocedure::oid,
        '\s+and\s+product\.is_whatsapp_active', ''),
      ('public.whatsapp_order_intents_admin_list_v1(uuid)'::regprocedure::oid,
        '\s+and\s+product\.is_whatsapp_active\s+is\s+true', ''),
      ('public.basket_mold_editor_v1(uuid)'::regprocedure::oid,
        '\s*''is_whatsapp_active'',\s*p\.is_whatsapp_active,', '')
    ) AS patch(proc, pattern, replacement)
  LOOP
    v_definition := pg_get_functiondef(v_proc);
    v_updated := regexp_replace(v_definition, v_pattern, v_replacement, 'gi');
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Product WhatsApp flag patch did not match function %, pattern %', v_proc::regprocedure, v_pattern;
    END IF;
    EXECUTE v_updated;
  END LOOP;
END
$migration$;