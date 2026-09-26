-- Operations 2.0 — canonical order -> delivery route synchronization.
create or replace function public.ops_sync_delivery_stop_from_order_trigger_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.status is distinct from new.status
    and new.status in ('out_for_delivery','delivered','ready','cancelled') then
   perform public.ops_sync_delivery_stop_v1(new.id,new.status);
 end if;
 return new;
end $$;
drop trigger if exists trg_ops_sync_delivery_stop_from_order_v1 on public.orders;
create trigger trg_ops_sync_delivery_stop_from_order_v1
after update of status on public.orders for each row
execute function public.ops_sync_delivery_stop_from_order_trigger_v1();
revoke all on function public.ops_sync_delivery_stop_from_order_trigger_v1() from public,anon,authenticated;
grant execute on function public.ops_sync_delivery_stop_from_order_trigger_v1() to service_role;
