-- R12 review-only patch of REAL ops3_complete_delivery_v1.
-- Extends legitimate previously captured split tender (PIX + cash etc)
-- without trying to capture payment again or changing existing settlement.
-- The original RPC checks only the first payment part and requires 1 part,
-- which incorrectly rejects a valid split previously registered by the
-- canonical ops_record_delivery_payment_v1.
DO $r12_split_delivery$
DECLARE original text;fixed text;
 old_check constant text:=
'if v_existing.status not in (''captured'',''synced'',''needs_review'')
       or v_existing.expected_total_cents<>v_expected
       or v_existing.captured_total_cents<>v_expected
       or v_existing_method is distinct from v_method
       or v_existing_amount is distinct from v_expected
       or (select count(*) from public.order_payment_parts where settlement_id=v_existing.id)<>1 then
      raise exception ''payment_already_captured'';
    end if;';
 new_check constant text:=
'if v_existing.status not in (''captured'',''synced'',''needs_review'')
       or v_existing.source is distinct from ''delivery''
       or v_existing.expected_total_cents<>v_expected
       or v_existing.captured_total_cents<>v_expected
       or not exists (
         select 1 from public.order_payment_parts p
         where p.settlement_id=v_existing.id
         group by p.settlement_id
         having count(*) between 1 and 8
           and sum(p.amount_cents)=v_expected
           and count(*)=count(*) filter (where p.amount_cents>0 and
             p.method in (''pix'',''cash'',''credit_card'',''food_card'',''meal_card'',''other''))
           and count(distinct p.sequence)=count(*)
       )
       or ((select count(*) from public.order_payment_parts
            where settlement_id=v_existing.id)=1
           and (v_existing_method is distinct from v_method
             or v_existing_amount is distinct from v_expected))
    then
      raise exception ''payment_already_captured'';
    end if;
    if (select count(*) from public.order_payment_parts
        where settlement_id=v_existing.id)>1 then
      v_method:=''mixed'';
    end if;';
BEGIN
 SELECT pg_get_functiondef(f.oid) INTO original
 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
 WHERE n.nspname='public' AND proname='ops3_complete_delivery_v1';
 IF original IS NULL THEN RAISE EXCEPTION 'r12_delivery_completion_function_missing'; END IF;
 IF position('v_method:=''mixed'';' in original)>0 THEN
   RAISE NOTICE 'r12_split_delivery_already_applied';
   RETURN;
 END IF;
 IF md5(original)<>'d20eb30841dae4ea7b3820e51a6ca7f9'
   THEN RAISE EXCEPTION 'r12_delivery_completion_changed_needs_review'; END IF;
 fixed:=replace(original,old_check,new_check);
 IF fixed=original THEN RAISE EXCEPTION 'r12_original_payment_guard_not_found'; END IF;
 EXECUTE fixed;
END $r12_split_delivery$;
