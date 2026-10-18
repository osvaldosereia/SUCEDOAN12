-- Already applied to production through Supabase MCP migration
-- 20261018141654 / p0_revoke_public_execute_on_privileged_side_effect_rpcs
-- Keep this copy in GitHub to reconcile deployed migration history.
REVOKE ALL ON FUNCTION public.ops2_maybe_enqueue_customer_bling_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_fiscal_nfe_autorecovery_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops2_maybe_enqueue_customer_bling_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_fiscal_nfe_autorecovery_v1() TO service_role;
