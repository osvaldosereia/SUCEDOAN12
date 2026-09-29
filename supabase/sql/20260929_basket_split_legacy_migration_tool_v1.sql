-- 2026-09-29 · Dona Antônia
-- Ferramenta de migração física parcial dos lotes completos antigos.
-- Executar somente depois que as cestas selecionadas forem realmente desmontadas.

alter table public.basket_stock_lots
  add column if not exists quantity_dismantled integer not null default 0;

do $$
begin
  if not exists(
    select 1 from pg_constraint where conname='basket_stock_lots_dismantled_chk'
  ) then
    alter table public.basket_stock_lots
      add constraint basket_stock_lots_dismantled_chk
      check (
        quantity_dismantled>=0
        and quantity_dismantled<=quantity_built
        and quantity_available+quantity_dismantled<=quantity_built
      );
  end if;
end $$;

create or replace function public.release_legacy_basket_lot_units_v1(
  p_lot_id uuid,
  p_quantity integer,
  p_operator text default null,
  p_note text default null
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_after integer;
begin
  if p_lot_id is null or coalesce(p_quantity,0)<=0 then raise exception 'invalid_release_quantity'; end if;

  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;

  if not found then raise exception 'lot_not_found'; end if;
  if v_lot.lot_kind<>'legacy_full' then raise exception 'legacy_lot_required'; end if;
  if v_lot.status not in ('ready','depleted') then raise exception 'lot_not_releasable'; end if;
  if p_quantity>coalesce(v_lot.quantity_available,0) then raise exception 'release_exceeds_available'; end if;

  v_after:=v_lot.quantity_available-p_quantity;

  update public.basket_stock_lots
  set quantity_available=v_after,
      quantity_dismantled=coalesce(quantity_dismantled,0)+p_quantity,
      status=case when v_after=0 then 'depleted' else 'ready' end,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_dismantled_at',now(),
        'last_dismantled_quantity',p_quantity,
        'last_dismantled_by',nullif(trim(coalesce(p_operator,'')),''),
        'last_dismantled_note',nullif(trim(coalesce(p_note,'')),''),
        'migration_release',true
      )
  where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,'lot_id',p_lot_id,'released_quantity',p_quantity,
    'quantity_available',v_after,
    'quantity_dismantled',coalesce(v_lot.quantity_dismantled,0)+p_quantity,
    'status',case when v_after=0 then 'depleted' else 'ready' end
  );
end;
$$;

revoke all on function public.release_legacy_basket_lot_units_v1(uuid,integer,text,text)
from public,anon,authenticated;
grant execute on function public.release_legacy_basket_lot_units_v1(uuid,integer,text,text)
to service_role;
