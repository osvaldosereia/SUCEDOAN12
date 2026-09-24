-- R41 · Gate fiscal definitivo no banco canônico
-- Protege qualquer caminho que tente colocar o pedido em entrega/entregue,
-- inclusive funções antigas, driver app e atualizações SQL diretas.

create or replace function public.enforce_order_dispatch_fiscal_gate_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  gate jsonb;
begin
  if new.status in ('out_for_delivery','delivered')
     and old.status not in ('out_for_delivery','delivered') then
    gate:=public.check_order_dispatch_fiscal_gate_v1(new.id);
    if coalesce((gate->>'allowed')::boolean,false) is not true then
      raise exception 'fiscal_dispatch_not_authorized:%',new.id
        using errcode='P0001',
              detail=coalesce(gate::text,'{}'),
              hint='Authorize the fiscal document before dispatch.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_fiscal_dispatch_gate_v1 on public.orders;
create trigger trg_orders_fiscal_dispatch_gate_v1
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.enforce_order_dispatch_fiscal_gate_trigger_v1();

revoke all on function public.enforce_order_dispatch_fiscal_gate_trigger_v1() from public,anon,authenticated;

comment on function public.enforce_order_dispatch_fiscal_gate_trigger_v1() is
'Fail-closed canonical DB guard: blocks any transition into out_for_delivery/delivered before fiscal authorization when dispatch gate is enforced.';
