-- Applied to canonical Supabase 20260930023355
-- Dona Antônia Operations 2.0
revoke all on function public.ops2_orders_ensure_site_customer_v1() from public,anon,authenticated;
revoke all on function public.ops2_auto_process_papoai_flow_v2() from public,anon,authenticated;
