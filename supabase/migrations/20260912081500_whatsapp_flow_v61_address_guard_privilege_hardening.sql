-- V61: harden direct execution privileges of the active-basket address guard.
-- The trigger remains operational; direct public/client invocation is forbidden.

revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from public;
revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from anon;
revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from authenticated;
revoke all on function public.route_whatsapp_active_basket_address_guard_v52() from service_role;
grant execute on function public.route_whatsapp_active_basket_address_guard_v52() to service_role;
