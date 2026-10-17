-- FIX 2026-10-09: /montar separation completion with missing products.
-- ops2_apply_order_separation_stock_v2 already applies reservation changes
-- and marks stock_applied BEFORE switching processing -> ready.
-- An old AFTER UPDATE trigger consumes the same reservations again, fails on
-- those released because of missing products, and rolls back the whole step.
-- Keep other statuses and legacy flows unchanged; never bypass the readiness gate.
create or replace function public.sync_vitrine_order_stock_reservation_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_error text;
begin
  if new.source = 'vitrine'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    -- Bling is the stock authority. The separation RPC has already consumed
    -- delivered reservations and released missing quantities atomically.
    -- Re-consuming on the 'ready' transition would reject legitimate missing
    -- lines ('stock_reservation_released'). Readiness and fiscal guards remain.
    if new.status = 'ready'
       and exists (
         select 1
           from public.bling_hub_runtime_v2 rt
          where rt.id = 1
            and rt.metadata->>'ops2_stock_authority' = 'bling'
       )
       and exists (
         select 1
           from public.order_separation_completions_v1 c
          where c.order_id = new.id
            and coalesce((c.metadata->>'stock_applied')::boolean,false) = true
       )
    then
      return new;
    end if;

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
$function$;
