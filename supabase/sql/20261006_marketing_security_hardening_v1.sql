begin;

alter table public.marketing_repurchase_state_v1 enable row level security;
alter table public.marketing_optout_events_v1 enable row level security;

revoke all on table public.marketing_repurchase_state_v1 from public, anon, authenticated;
revoke all on table public.marketing_optout_events_v1 from public, anon, authenticated;
grant all on table public.marketing_repurchase_state_v1 to service_role;
grant all on table public.marketing_optout_events_v1 to service_role;

revoke all on function public.marketing_repurchase_recalc_v1(uuid) from public, anon, authenticated;
revoke all on function public.marketing_repurchase_mark_sent_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_repurchase_order_trigger_v1() from public, anon, authenticated;
revoke all on function public.marketing_repurchase_customer_trigger_v1() from public, anon, authenticated;
revoke all on function public.marketing_capture_optout_v1() from public, anon, authenticated;

grant execute on function public.marketing_repurchase_recalc_v1(uuid) to service_role;
grant execute on function public.marketing_repurchase_mark_sent_v1(uuid,uuid,timestamptz) to service_role;

commit;

revoke all on function public.marketing_repurchase_order_trigger_v1() from service_role;
revoke all on function public.marketing_repurchase_customer_trigger_v1() from service_role;
revoke all on function public.marketing_capture_optout_v1() from service_role;
