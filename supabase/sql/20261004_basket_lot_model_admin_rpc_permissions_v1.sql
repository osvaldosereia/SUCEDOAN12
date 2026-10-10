begin;

revoke all on function public.reopen_basket_kit_lot_for_edit_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.save_basket_kit_template_admin_v1(uuid,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.archive_basket_kit_template_admin_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.archive_basket_template_admin_v1(uuid,text) from public, anon, authenticated;

grant execute on function public.reopen_basket_kit_lot_for_edit_v1(uuid,text) to service_role;
grant execute on function public.save_basket_kit_template_admin_v1(uuid,text,text,jsonb,text) to service_role;
grant execute on function public.archive_basket_kit_template_admin_v1(uuid,text) to service_role;
grant execute on function public.archive_basket_template_admin_v1(uuid,text) to service_role;

commit;
