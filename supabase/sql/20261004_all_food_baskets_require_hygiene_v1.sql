begin;

-- Dona Antônia operational model: every food basket is paired with the universal
-- Limpeza/Higiene kit. Normalize older basket rows that predate that rule.
update public.basket_templates b
set uses_hygiene_kit=true
where coalesce(b.uses_hygiene_kit,false)=false
  and exists (
    select 1
    from public.basket_kit_templates k
    where k.basket_id=b.id
      and k.kind='food'
      and k.is_active=true
  );

-- If a ready hygiene lot exists during deployment, connect older ready food lots
-- that still have no explicit link. Cancelled/dismantled hygiene lots are ignored.
with chosen_hygiene as (
  select l.id
  from public.basket_stock_lots l
  join public.basket_kit_templates k on k.id=l.kit_template_id
  where k.kind='hygiene'
    and k.is_active=true
    and l.status='ready'
    and l.quantity_available>0
  order by l.sale_enabled desc,l.built_at,l.created_at,l.id
  limit 1
)
update public.basket_stock_lots l
set linked_hygiene_lot_id=h.id,
    metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
      'linked_hygiene_lot_id',h.id,
      'linked_hygiene_normalized_at',now()
    ),
    updated_at=now()
from public.basket_kit_templates k
join public.basket_templates b on b.id=k.basket_id and b.uses_hygiene_kit=true
cross join chosen_hygiene h
where l.kit_template_id=k.id
  and k.kind='food'
  and l.status in ('draft','ready')
  and l.linked_hygiene_lot_id is null;

create or replace function public.set_basket_lot_sale_enabled_v1(
  p_lot_id uuid,
  p_enabled boolean,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_requires_hygiene boolean:=false;
begin
  if p_lot_id is null then raise exception 'lot_not_found'; end if;

  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;

  if not found then raise exception 'lot_not_found'; end if;

  if p_enabled then
    if v_lot.status<>'ready' or coalesce(v_lot.quantity_available,0)<=0 then
      raise exception 'lot_not_available_for_sale';
    end if;

    if v_lot.lot_kind='food' then
      select coalesce(b.uses_hygiene_kit,false)
        into v_requires_hygiene
      from public.basket_kit_templates k
      left join public.basket_templates b on b.id=k.basket_id
      where k.id=v_lot.kit_template_id;

      if v_requires_hygiene and v_lot.linked_hygiene_lot_id is null then
        raise exception 'linked_hygiene_lot_required';
      end if;

      if v_requires_hygiene and not exists (
        select 1
        from public.basket_stock_lots hl
        join public.basket_kit_templates hk on hk.id=hl.kit_template_id
        where hl.id=v_lot.linked_hygiene_lot_id
          and hk.kind='hygiene'
          and hk.is_active=true
          and hl.status='ready'
          and hl.quantity_available>0
      ) then
        raise exception 'linked_hygiene_lot_unavailable';
      end if;
    end if;
  end if;

  update public.basket_stock_lots
  set sale_enabled=p_enabled,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'sale_enabled_changed_at',now(),
        'sale_enabled_changed_by',nullif(trim(coalesce(p_operator,'')),''),
        'sale_enabled',p_enabled
      )
  where id=p_lot_id;

  return jsonb_build_object(
    'ok',true,
    'lot_id',p_lot_id,
    'sale_enabled',p_enabled,
    'lot_kind',v_lot.lot_kind,
    'short_code',v_lot.short_code,
    'lot_code',v_lot.lot_code,
    'linked_hygiene_lot_id',v_lot.linked_hygiene_lot_id
  );
end;
$$;

commit;
