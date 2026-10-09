-- DA6: gera credencial exclusivamente dentro do Vault. Nenhuma credencial no repositório.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='da6_label_worker_key_v1') THEN
  PERFORM vault.create_secret(encode(gen_random_bytes(32),'hex'),'da6_label_worker_key_v1','Token interno para o worker OMR DA6');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.da6_worker_key_v1()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_key text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'worker_only' USING ERRCODE='42501';
 END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='da6_label_worker_key_v1';
 IF nullif(v_key,'') IS NULL THEN RAISE EXCEPTION 'worker_key_missing'; END IF;
 RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public.da6_worker_key_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.da6_worker_key_v1() TO service_role;
