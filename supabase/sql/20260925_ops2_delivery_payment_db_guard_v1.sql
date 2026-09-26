-- Operations 2.0 — delivered payment invariant.
-- Applied live 2026-09-25.
create or replace function public.ops_enforce_delivery_payment_before_delivered_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_expected bigint; v_valid integer:=0; v_return_open integer:=0;
begin
 if new.status='delivered' and old.status='out_for_delivery' then
  v_expected:=round(coalesce(new.total,0)*100)::bigint;
  select count(*) into v_return_open from public.order_delivery_return_cases
   where order_id=new.id and status in ('returning','returned_review');
  if v_return_open>0 then raise exception 'delivery_return_open'; end if;
  select count(*) into v_valid from public.order_payment_settlements s
   where s.order_id=new.id and s.source='delivery'
    and s.status in ('captured','synced','needs_review')
    and s.expected_total_cents=v_expected and s.captured_total_cents=v_expected
    and exists(select 1 from public.order_payment_parts p where p.settlement_id=s.id
      group by p.settlement_id having sum(p.amount_cents)=v_expected);
  if v_valid<>1 then raise exception 'delivery_payment_required_before_delivered'; end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_ops_enforce_delivery_payment_before_delivered_v1 on public.orders;
create trigger trg_ops_enforce_delivery_payment_before_delivered_v1
before update of status on public.orders for each row
execute function public.ops_enforce_delivery_payment_before_delivered_v1();
revoke all on function public.ops_enforce_delivery_payment_before_delivered_v1() from public,anon,authenticated;
grant execute on function public.ops_enforce_delivery_payment_before_delivered_v1() to service_role;
