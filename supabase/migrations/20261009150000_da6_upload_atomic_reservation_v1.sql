-- DA6 R3: reserva transacional de arquivos no lote privado.
-- A autorização do usuário vem exclusivamente do gateway autenticado.
-- Esta função não altera estoque, notas fiscais ou Bling.
CREATE OR REPLACE FUNCTION public.inventory_label_reserve_photo_v1(
 p_batch_id uuid,p_user_id uuid,p_file_name text,p_mime_type text,p_size_bytes integer,p_sha256 text
)
RETURNS TABLE(photo_id uuid,photo_batch_id uuid,photo_status text,photo_storage_path text,is_duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_batch public.inventory_label_batches%ROWTYPE;
 v_photo public.inventory_label_photos%ROWTYPE;
 v_ext text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'worker_only' USING ERRCODE='42501';
 END IF;
 IF p_batch_id IS NULL OR p_user_id IS NULL OR p_file_name IS NULL
    OR length(btrim(p_file_name))<1 OR length(p_file_name)>180
    OR p_size_bytes NOT BETWEEN 1 AND 10485760
    OR p_sha256 !~ '^[a-f0-9]{64}$'
    OR p_mime_type NOT IN ('image/jpeg','image/png','image/webp') THEN
  RAISE EXCEPTION 'invalid_photo' USING ERRCODE='22023';
 END IF;
 v_ext:=CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
 -- Serializa todas as reservas do mesmo lote; é mais seguro do que COUNT isolado na API.
 SELECT * INTO v_batch FROM public.inventory_label_batches
  WHERE id=p_batch_id AND created_by=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_owned' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_photo FROM public.inventory_label_photos
  WHERE created_by=p_user_id AND sha256=p_sha256 FOR UPDATE;
 IF FOUND THEN
  RETURN QUERY SELECT v_photo.id,v_photo.batch_id,v_photo.status,v_photo.storage_path,
   (v_photo.batch_id<>p_batch_id OR v_photo.status<>'uploading');
  RETURN;
 END IF;
 IF (SELECT count(*) FROM public.inventory_label_photos WHERE batch_id=p_batch_id)>=v_batch.total_files THEN
  RAISE EXCEPTION 'batch_full' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.inventory_label_photos
  (batch_id,created_by,storage_path,file_name,mime_type,size_bytes,sha256,status,attempts)
 VALUES (p_batch_id,p_user_id,
   p_user_id::text||'/'||p_batch_id::text||'/'||gen_random_uuid()::text||'.'||v_ext,
   p_file_name,p_mime_type,p_size_bytes,p_sha256,'uploading',0)
 RETURNING * INTO v_photo;
 RETURN QUERY SELECT v_photo.id,v_photo.batch_id,v_photo.status,v_photo.storage_path,false;
END $$;
REVOKE ALL ON FUNCTION public.inventory_label_reserve_photo_v1(uuid,uuid,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_label_reserve_photo_v1(uuid,uuid,text,text,integer,text)
 TO service_role;
