-- Keep the Bling customer creation guard internal to the database trigger.
-- Trigger execution does not require exposing this SECURITY DEFINER function as an RPC.

revoke all on function public.bling_hub_customer_creation_guard_v1() from public;
revoke all on function public.bling_hub_customer_creation_guard_v1() from anon;
revoke all on function public.bling_hub_customer_creation_guard_v1() from authenticated;
