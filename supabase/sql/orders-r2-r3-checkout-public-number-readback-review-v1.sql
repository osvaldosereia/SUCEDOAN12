-- R02 + R03 REVIEW DRAFT ONLY: never execute directly against production.
-- Original create_vitrine_cart_order_v3_base returns a locally generated DA-*
-- order_number even after R03 BEFORE INSERT assigns a weekly DD|MM|YYYY - NNN.
-- After the INSERT, read back the database-assigned identity, so the very
-- first checkout response matches every subsequent /montar/Admin/Meta stage.
-- Requires R02 minimum-R$75 and independent-basket-group drafts FIRST,
-- and the R03 weekly identity migration and snapshot triggers SECOND.
DO $reconcile_checkout_identity$
DECLARE
 current_definition text;
 corrected_definition text;
 anchor constant text :=
   '  for v_line in select value from jsonb_array_elements(v_item_rows) loop';
 marker constant text :=
   '  -- R02+R03: return the immutable order identity assigned by the database.';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO current_definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_vitrine_cart_order_v3_base';
 IF current_definition IS NULL THEN RAISE EXCEPTION 'checkout_missing'; END IF;
 IF position(marker IN current_definition)>0 THEN
   RAISE NOTICE 'checkout_identity_readback_already_installed';
   RETURN;
 END IF;
 IF md5(current_definition)<>'927bd6406badc650daff796e69e8ff05' THEN
   RAISE EXCEPTION 'checkout_definition_changed_before_number_readback_review';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='orders'
     AND t.tgname='trg_ops2_assign_order_weekly_number_v1'
     AND NOT t.tgisinternal AND t.tgenabled<>'D'
 ) THEN RAISE EXCEPTION 'r03_weekly_trigger_not_active'; END IF;
 IF position(anchor IN current_definition)=0 THEN
   RAISE EXCEPTION 'checkout_item_insertion_anchor_missing'; END IF;

 corrected_definition:=replace(current_definition,anchor,
   marker||E'\n'||
   '  select o.order_number into v_order_number from public.orders o where o.id=v_order_id;'||E'\n'||
   '  if v_order_number is null then raise exception ''checkout_order_number_missing''; end if;'||E'\n'||
   anchor);
 IF corrected_definition=current_definition THEN RAISE EXCEPTION 'checkout_patch_noop'; END IF;
 EXECUTE corrected_definition;
END $reconcile_checkout_identity$;
