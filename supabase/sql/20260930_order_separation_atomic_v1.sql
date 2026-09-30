-- Dona Antônia · separação atômica e reserva de estoque
-- Confirmar mantém a reserva. O consumo acontece na entrada em separação
-- e falha a própria transição se a reserva não puder ser consumida.

create or replace function public.sync_vitrine_order_stock_reservation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_error text;
begin
  if new.source = 'vitrine'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.status in ('processing','ready','out_for_delivery','delivered') then
      v_result := public.consume_vitrine_order_stock_v1(new.id);
      if coalesce((v_result->>'ok')::boolean,false) is not true then
        v_error := coalesce(nullif(v_result->>'error',''),'unknown');
        raise exception 'order_stock_consume_failed:%', v_error
          using errcode = 'P0001';
      end if;
    elsif new.status in ('cancelled','returned') then
      perform public.release_vitrine_order_stock_v1(new.id);
    end if;
  end if;
  return new;
end;
$$;

comment on function public.sync_vitrine_order_stock_reservation_v1()
is 'Confirmed orders stay reserved; stock reservation is consumed atomically when the order enters processing or a later operational status.';
