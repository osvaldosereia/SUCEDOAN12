-- Dona Antonia Operations 2.0
-- Guarded activation/rollback for Bling stock authority.
CREATE OR REPLACE FUNCTION public.ops2_activate_bling_stock_authority_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pre jsonb; v_now timestamptz:=now(); v_current text;
BEGIN
 SELECT coalesce(metadata->>'ops2_stock_authority','legacy_shadow') INTO v_current FROM public.bling_hub_runtime_v2 WHERE id=1 FOR UPDATE;
 IF v_current='bling' THEN RETURN jsonb_build_object('ok',true,'already_active',true,'authority','bling'); END IF;
 v_pre:=public.get_ops2_stock_cutover_preflight_v1();
 IF coalesce((v_pre->>'ready')::boolean,false) IS NOT TRUE THEN RETURN jsonb_build_object('ok',false,'error','stock_cutover_preflight_failed','preflight',v_pre); END IF;
 UPDATE public.bling_hub_runtime_v2 SET metadata=jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),'{ops2_stock_authority}','"bling"'::jsonb,true),'{ops2_stock_cutover_at}',to_jsonb(v_now::text),true),updated_at=v_now WHERE id=1;
 RETURN jsonb_build_object('ok',true,'authority','bling','cutover_at',v_now,'preflight',v_pre);
END $$;
REVOKE ALL ON FUNCTION public.ops2_activate_bling_stock_authority_v1() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_activate_bling_stock_authority_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.ops2_rollback_bling_stock_authority_v1(p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_now timestamptz:=now(); v_reason text;
BEGIN
 v_reason:=left(nullif(trim(coalesce(p_reason,'')),''),500);
 IF v_reason IS NULL THEN RETURN jsonb_build_object('ok',false,'error','rollback_reason_required'); END IF;
 UPDATE public.bling_hub_runtime_v2 SET metadata=jsonb_set(jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),'{ops2_stock_authority}','"legacy_shadow"'::jsonb,true),'{ops2_stock_rollback_at}',to_jsonb(v_now::text),true),'{ops2_stock_rollback_reason}',to_jsonb(v_reason),true),updated_at=v_now WHERE id=1;
 RETURN jsonb_build_object('ok',true,'authority','legacy_shadow','rolled_back_at',v_now,'reason',v_reason);
END $$;
REVOKE ALL ON FUNCTION public.ops2_rollback_bling_stock_authority_v1(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_rollback_bling_stock_authority_v1(text) TO service_role;
