-- DA6 R5: extremos 0/99, rejeição, duplicidade, idempotência e ACL/RLS.
-- Continua a transação de da6-review-postgres-assertions.sql e termina em ROLLBACK.
\set ON_ERROR_STOP on
INSERT INTO public.inventory_label_photos(id,batch_id,created_by,status,parsed)
VALUES
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111','needs_review',
  '{"product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","label_serial":"FACEB00C01","errors":[{"slot":3,"reason":"multiple_marks"}]}'::jsonb),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111','needs_review',
  '{"product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","label_serial":"FACEB00C01","errors":[{"slot":1,"reason":"duplicate"}]}'::jsonb);
INSERT INTO public.inventory_label_counts
 (photo_id,batch_id,product_id,label_serial,balance_slot,quantity,confidence,status)
VALUES
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','FACEB00C01',1,0,.95,'pending_review'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','FACEB00C01',2,99,.80,'pending_review');
SELECT public.inventory_label_review_count_v1(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1::smallint,'approve',null,
 '11111111-1111-4111-8111-111111111111','Conferido no produto');
SELECT public.inventory_label_review_count_v1(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',2::smallint,'reject',null,
 '11111111-1111-4111-8111-111111111111','Leitura incorreta');
SELECT public.inventory_label_review_count_v1(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',3::smallint,'correct',99::smallint,
 '11111111-1111-4111-8111-111111111111','Verificado visualmente');
DO $$
DECLARE blocked boolean;event_count integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_label_counts
   WHERE label_serial='FACEB00C01' AND (
      balance_slot=1 AND (quantity<>0 OR status<>'approved') OR
      balance_slot=2 AND (quantity<>99 OR status<>'rejected') OR
      balance_slot=3 AND (quantity<>99 OR status<>'approved')
   )) THEN RAISE EXCEPTION 'wrong_review_status'; END IF;
 IF (SELECT COUNT(*) FROM public.inventory_label_review_events WHERE photo_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>3 THEN
  RAISE EXCEPTION 'wrong_audit_event_count';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_label_review_events
     WHERE decision='reject' AND old_quantity=99 AND new_quantity IS NULL AND new_status='rejected') THEN
   RAISE EXCEPTION 'reject_event_missing_old_and_new_quantity';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_label_review_events
     WHERE decision='approve' AND old_quantity=0 AND new_quantity=0 AND new_status='approved') THEN
   RAISE EXCEPTION 'zero_is_not_preserved';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_label_review_events
     WHERE decision='correct' AND old_quantity IS NULL AND new_quantity=99 AND length(note)>=5) THEN
   RAISE EXCEPTION 'manual_correct_audit_missing';
 END IF;
 -- Rejeição idempotente nunca gera segundo evento.
 SELECT count(*) INTO event_count FROM public.inventory_label_review_events;
 PERFORM public.inventory_label_review_count_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',2::smallint,'reject',null,
   '11111111-1111-4111-8111-111111111111','Replay');
 IF (SELECT count(*) FROM public.inventory_label_review_events)<>event_count THEN
   RAISE EXCEPTION 'reject_replay_created_duplicate_event';
 END IF;
 -- Outro arquivo com MESMO serial+slot não pode assumir um balanço já registrado.
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1::smallint,'correct',22::smallint,
   '11111111-1111-4111-8111-111111111111','Outra imagem da etiqueta');
 EXCEPTION WHEN unique_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'duplicate_photo_changed_original_count'; END IF;
 -- Não permitir corrigir quantidade rejeitada/finalizada depois de concluir.
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1::smallint,'correct',11::smallint,
   '11111111-1111-4111-8111-111111111111','Correção tardia');
 EXCEPTION WHEN unique_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'finalized_count_overwritten'; END IF;
 -- Quantidade só é enviada na ação correct.
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1::smallint,'approve',0::smallint,
   '11111111-1111-4111-8111-111111111111','Forjada');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'quantity_was_allowed_for_approve'; END IF;
 -- Correção com quantidade >99 ou negativo não pode ser registrada.
 FOR event_count IN 1..2 LOOP
  blocked:=false;
  BEGIN
   PERFORM public.inventory_label_review_count_v1(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1::smallint,'correct',
    CASE WHEN event_count=1 THEN (-1)::smallint ELSE 100::smallint END,
    '11111111-1111-4111-8111-111111111111','Tentativa inválida');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'quantity_out_of_range_allowed'; END IF;
 END LOOP;
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL,'approve',NULL,
   '11111111-1111-4111-8111-111111111111','Slot nulo');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'null_slot_allowed'; END IF;
 IF has_function_privilege('authenticated',
  'public.inventory_label_review_count_v1(uuid,smallint,text,smallint,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'authenticated_has_direct_review_rpc';
 END IF;
 IF has_table_privilege('authenticated','public.inventory_label_review_events','SELECT') THEN
   RAISE EXCEPTION 'authenticated_has_audit_read_access';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.inventory_label_review_events'::regclass) THEN
   RAISE EXCEPTION 'review_audit_rls_disabled';
 END IF;
 RAISE NOTICE 'DA6 R5: 0/99, reject, correction, duplicate, idempotency, authorization, RLS PASS';
END $$;
ROLLBACK;
