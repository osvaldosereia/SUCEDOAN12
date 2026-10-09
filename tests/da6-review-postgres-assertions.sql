-- DA6: executed against a disposable PostgreSQL 17 transaction.
\set ON_ERROR_STOP on
SELECT public.inventory_label_review_count_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,1::smallint,'approve',null,
 '11111111-1111-4111-8111-111111111111'::uuid,'Conferido por fotografia');
SELECT public.inventory_label_review_count_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,2::smallint,'correct',41,
 '11111111-1111-4111-8111-111111111111'::uuid,'Correção visual de marcação dupla');
-- Idempotência: aprovação repetida não cria histórico novo.
SELECT public.inventory_label_review_count_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,1::smallint,'approve',null,
 '11111111-1111-4111-8111-111111111111'::uuid,'Repetição');
DO $$
DECLARE v_blocked boolean;
BEGIN
 IF (SELECT count(*) FROM public.inventory_label_review_events) <> 2 THEN
  RAISE EXCEPTION 'expected_two_audit_events';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_label_counts
 WHERE balance_slot=1 AND quantity=23 AND status='approved') THEN
  RAISE EXCEPTION 'approval_lost';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_label_counts
 WHERE balance_slot=2 AND quantity=41 AND status='approved') THEN
  RAISE EXCEPTION 'correction_lost';
 END IF;
 -- Foto pertence a outro operador: bloqueado.
 v_blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'approve',null,
   '22222222-2222-4222-8222-222222222222','Outro operador');
 EXCEPTION WHEN others THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'foreign_operator_allowed'; END IF;
 -- Papel viewer: bloqueado.
 v_blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'approve',null,
   '33333333-3333-4333-8333-333333333333','Viewer');
 EXCEPTION WHEN others THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'viewer_allowed'; END IF;
 -- Não se pode corrigir posição sem marcação e sem erro OMR.
 v_blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,'correct',10,
   '11111111-1111-4111-8111-111111111111','Não há marcação');
 EXCEPTION WHEN others THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'inactive_slot_created'; END IF;
 -- Não aceitar correção sem motivo.
 v_blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'correct',20,
   '11111111-1111-4111-8111-111111111111','');
 EXCEPTION WHEN others THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'blank_reason_allowed'; END IF;
 -- Sem credencial de serviço não deve autorizar RPC, mesmo com papel SQL owner.
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 v_blocked:=false;
 BEGIN
  PERFORM public.inventory_label_review_count_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'approve',null,
   '11111111-1111-4111-8111-111111111111','Tentativa');
 EXCEPTION WHEN others THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'client_executed_rpc'; END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 IF EXISTS (SELECT 1 FROM public.inventory_label_counts WHERE status='pending_review') THEN
   RAISE EXCEPTION 'unexpected_pending_review';
 END IF;
 RAISE NOTICE 'DA6 PostgreSQL: APPROVED two slots, audit/idempotency/ACL/inactive-slot/reason PASS';
END $$;
ROLLBACK;
