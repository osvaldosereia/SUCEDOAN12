-- Operations 2.0 — fiscal authorization is a database-level dispatch invariant.
-- Applied live 2026-09-25.
create or replace function public.ops_enforce_fiscal_before_dispatch_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
declare allowed boolean:=false;
begin
  if new.status='out_for_delivery' and old.status='ready' then
    select c.dispatch_fiscal_status in ('authorized','not_required') into allowed
    from public.order_fiscal_controls c where c.order_id=new.id;
    if coalesce(allowed,false) is not true then
      raise exception 'fiscal_authorization_required_before_dispatch';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ops_enforce_fiscal_before_dispatch_v1 on public.orders;
create trigger trg_ops_enforce_fiscal_before_dispatch_v1
before update of status on public.orders
for each row execute function public.ops_enforce_fiscal_before_dispatch_v1();
revoke all on function public.ops_enforce_fiscal_before_dispatch_v1() from public,anon,authenticated;
grant execute on function public.ops_enforce_fiscal_before_dispatch_v1() to service_role;
