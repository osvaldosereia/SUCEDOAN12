-- Assertion suite for DA6 atomic upload admission.
\set ON_ERROR_STOP on
DO $$
DECLARE i integer; row record; v_count integer; blocked boolean;
BEGIN
 FOR i IN 1..10 LOOP
   SELECT * INTO row FROM public.inventory_label_reserve_photo_v1(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
     'label-'||i||'.jpeg','image/jpeg',1024,lpad(to_hex(i),64,'0'));
   IF row.is_duplicate IS DISTINCT FROM false OR row.photo_status<>'uploading'
    OR row.photo_batch_id<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    OR row.photo_storage_path NOT LIKE '11111111-1111-4111-8111-111111111111/%'
   THEN RAISE EXCEPTION 'new_reserve_failed %',i; END IF;
 END LOOP;
 SELECT count(*) INTO v_count FROM public.inventory_label_photos
  WHERE batch_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF v_count<>10 THEN RAISE EXCEPTION 'wrong_batch_capacity %',v_count; END IF;
 -- Same SHA while uploading returns same reservation and does not increment.
 SELECT * INTO row FROM public.inventory_label_reserve_photo_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
 'label-1.jpeg','image/jpeg',1024,lpad(to_hex(1),64,'0'));
 IF row.is_duplicate OR row.photo_status<>'uploading' THEN RAISE EXCEPTION 'upload_resume_failed';END IF;
 UPDATE public.inventory_label_photos SET status='queued' WHERE id=row.photo_id;
 SELECT * INTO row FROM public.inventory_label_reserve_photo_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
 'label-1.jpeg','image/jpeg',1024,lpad(to_hex(1),64,'0'));
 IF NOT row.is_duplicate OR row.photo_status<>'queued' THEN RAISE EXCEPTION 'duplicate_finished_not_found';END IF;
 -- Another batch cannot claim the prior object's quota as a new photograph.
 SELECT * INTO row FROM public.inventory_label_reserve_photo_v1(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
 'label-1.jpeg','image/jpeg',1024,lpad(to_hex(1),64,'0'));
 IF NOT row.is_duplicate OR row.photo_batch_id<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN
   RAISE EXCEPTION 'cross_batch_duplicate_failed';
 END IF;
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_reserve_photo_v1(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
   'overflow.jpeg','image/jpeg',1024,lpad(to_hex(500),64,'0'));
 EXCEPTION WHEN others THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'batch_overflow_accepted';END IF;
 -- User cannot reserve into a batch belonging to a different operator.
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_reserve_photo_v1(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
   'wrong_owner.jpeg','image/jpeg',1024,lpad(to_hex(501),64,'0'));
 EXCEPTION WHEN others THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'foreign_batch_accepted';END IF;
 -- Invalid mime, size and fake SHA must never allocate an object row.
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_reserve_photo_v1(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
   'payload.html','text/html',1024,lpad(to_hex(502),64,'0'));
 EXCEPTION WHEN others THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'dangerous_mime_accepted';END IF;
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_reserve_photo_v1(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
   'huge.jpeg','image/jpeg',10485761,lpad(to_hex(503),64,'0'));
 EXCEPTION WHEN others THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'huge_image_accepted';END IF;
 blocked:=false;
 BEGIN
  PERFORM public.inventory_label_reserve_photo_v1(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
   'bad-hash.jpeg','image/jpeg',1024,'nope');
 EXCEPTION WHEN others THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'invalid_sha_accepted';END IF;
 -- Ensure independent operator can use same image hash under a different lot.
 SELECT * INTO row FROM public.inventory_label_reserve_photo_v1(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',
 'photo.jpeg','image/jpeg',1024,lpad(to_hex(1),64,'0'));
 IF row.is_duplicate OR row.photo_batch_id<>'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN
  RAISE EXCEPTION 'different_operator_blocked';
 END IF;
 RAISE NOTICE 'DA6 atomic upload: cap, retry, duplicate, MIME, ownership, roles PASS';
END $$;
-- RPC execute permission must NOT be given to authenticated clients.
SELECT has_function_privilege('authenticated',
 'public.inventory_label_reserve_photo_v1(uuid,uuid,text,text,integer,text)','EXECUTE') AS authenticated_can_run
\gset
\if :authenticated_can_run
  \echo ERROR: authenticated RPC grant
  \quit 1
\endif
ROLLBACK;
