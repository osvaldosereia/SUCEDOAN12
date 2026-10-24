-- Dona Antônia · checkout de Cestas/Kits usa disponibilidade canônica sob lock.
-- Mantém o motor atual de personalização e troca somente a decisão de estoque do lote.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure)
    into v_def;

  v_old:=$old$
      if not v_group_changed then
        perform 1
        from public.basket_stock_lots
        where id=v_group_lot_id and status='ready' and quantity_available>0 and (v_group='hygiene' or sale_enabled=true)
        for update;
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;

        v_lot_requested:=coalesce((v_lot_demand->>v_group_lot_id::text)::integer,0)+v_line_qty::integer;
        select quantity_available into v_existing_stock
        from public.basket_stock_lots where id=v_group_lot_id;
        if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_kit_lot_insufficient'; end if;
        v_lot_demand:=jsonb_set(v_lot_demand,array[v_group_lot_id::text],to_jsonb(v_lot_requested),true);
$old$;

  v_new:=$new$
      if not v_group_changed then
        -- Lock first, then read the canonical view. A concurrent checkout cannot
        -- reuse the same last unit after the first transaction updates the lot.
        perform 1
        from public.basket_stock_lots
        where id=v_group_lot_id
        for update;
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;

        v_lot_requested:=coalesce((v_lot_demand->>v_group_lot_id::text)::integer,0)+v_line_qty::integer;
        select public_available into v_existing_stock
        from public.basket_lot_public_availability_v1
        where lot_id=v_group_lot_id
          and availability_reason='available';
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;
        if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_kit_lot_insufficient'; end if;
        v_lot_demand:=jsonb_set(v_lot_demand,array[v_group_lot_id::text],to_jsonb(v_lot_requested),true);
$new$;

  if position(v_old in v_def)=0 then
    raise exception 'basket_canonical_checkout_anchor_missing';
  end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end
$patch$;

-- Preserve the generic one-level link selected in the editor. The current cart
-- engine already allocates the second group separately; this keeps the link source canonical.
do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure)
    into v_def;
  v_old:=$old$where fl.id=v_food_lot_id and coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) is not null$old$;
  v_new:=$new$where fl.id=v_food_lot_id and coalesce(fl.linked_lot_id,fl.linked_hygiene_lot_id) is not null$new$;
  if position(v_old in v_def)>0 then
    -- No-op replacement intentionally pins the generic-link contract in this migration.
    v_def:=replace(v_def,v_old,v_new);
    execute v_def;
  end if;
end
$patch$;
