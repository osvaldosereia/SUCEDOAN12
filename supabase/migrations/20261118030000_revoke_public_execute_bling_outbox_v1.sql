-- Keep the privileged outbox functions callable only by trusted database code.
-- These functions are invoked by triggers, never through client RPC.
revoke execute on function public.enqueue_bling_hub_product_outbox_v1() from public, anon, authenticated;
revoke execute on function public.enqueue_bling_hub_stock_outbox_v1() from public, anon, authenticated;
revoke execute on function public.enqueue_bling_stock_after_product_link_v1() from public, anon, authenticated;
revoke execute on function public.project_bling_hub_product_sync_status_v1() from public, anon, authenticated;
