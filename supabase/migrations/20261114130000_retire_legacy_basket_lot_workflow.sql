-- Retire the obsolete lot-based basket workflow. Current sales use basket molds and
-- the live order reservation tables; this also removes the order-status trigger
-- that kept old basket allocations synchronized.

DROP TRIGGER IF EXISTS trg_sync_basket_allocations_order_status ON public.orders;

DROP VIEW IF EXISTS public.basket_split_availability_v1;
DROP VIEW IF EXISTS public.basket_commercial_catalog_v1;
DROP VIEW IF EXISTS public.basket_current_kit_lot_v2;
DROP VIEW IF EXISTS public.basket_current_lot_v1;
DROP VIEW IF EXISTS public.basket_lot_public_availability_v1;
DROP VIEW IF EXISTS public.basket_locked_component_stock_v1;

-- Current order stock consumption uses only vitrine_stock_reservations.
-- A basket with no loose-product reservations has nothing to consume here; actual
-- separated quantities are applied by ops2_apply_order_separation_stock_v2.
CREATE OR REPLACE FUNCTION public.consume_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count integer;
  v_consumed integer;
  v_released integer;
  v_stock numeric;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.vitrine_stock_reservations
  where order_id=p_order_id;

  if v_count=0 then
    return jsonb_build_object('ok',true,'status','no_reservations',
      'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
  end if;
  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status','consumed','already_consumed',true,
      'local_consume_skipped',false,'reservations_consumed',true);
  end if;
  if v_released>0 then
    return jsonb_build_object('ok',false,'error','stock_reservation_released');
  end if;

  for r in
    select product_id,quantity
    from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved'
    order by product_id
    for update
  loop
    select stock into v_stock
    from public.products
    where id=r.product_id and is_active=true
    for update;
    if not found then
      return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id);
    end if;
    if coalesce(v_stock,0)<r.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_physical_stock',
        'product_id',r.product_id,'available',coalesce(v_stock,0),'requested',r.quantity);
    end if;
  end loop;

  for r in
    select product_id,quantity
    from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved'
    order by product_id
  loop
    update public.products
    set stock=coalesce(stock,0)-r.quantity,updated_at=now()
    where id=r.product_id;
  end loop;

  update public.vitrine_stock_reservations
  set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
  where order_id=p_order_id and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false,
    'stock_source','supabase_products_stock','physical_stock_changed',true);
end;
$function$;

-- Keep separation idempotent and preserve the product-stock workflow for
-- current and already-open orders, without writing to the retired allocation table.
CREATE OR REPLACE FUNCTION public.ops2_apply_order_separation_stock_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_completion public.order_separation_completions_v1%rowtype;
  v_missing_components jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_order_status text;
  v_cutover timestamptz;
  r record;
  v_delta numeric;
  v_stock numeric;
  v_deliverable_qty numeric;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  select status into v_order_status from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  select * into v_completion from public.order_separation_completions_v1 where order_id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','separation_completion_not_prepared'); end if;
  if coalesce((v_completion.metadata->>'stock_applied')::boolean,false) then
    if v_order_status in ('confirmed','processing') then
      update public.orders set status='ready',updated_at=v_now where id=p_order_id;
      v_order_status:='ready';
    end if;
    return jsonb_build_object('ok',true,'status','already_applied','physical_stock_changed',false,
      'stock_source','supabase_products_stock','phase',v_completion.phase,'local_order_status',v_order_status,'metadata',v_completion.metadata);
  end if;
  if v_order_status not in ('confirmed','processing','ready') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order_status);
  end if;
  select nullif(metadata->>'ops2_supabase_stock_authority_at','')::timestamptz into v_cutover
  from public.bling_hub_runtime_v2 where id=1;

  for r in
    select vr.id,vr.product_id,vr.quantity,vr.status,vr.consumed_at,
      coalesce(d.deliverable_qty,0)::numeric as deliverable_qty
    from public.vitrine_stock_reservations vr
    left join (
      select s.product_id,
        sum(case when coalesce(oi.metadata->>'history_kind','')='basket_component'
          then greatest(0,s.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0))
          else s.quantity end)::numeric as deliverable_qty
      from public.order_separation_items_v1 s
      join public.order_items oi on oi.id=s.order_item_id
      where s.order_id=p_order_id and s.state='separated' and s.product_id is not null
      group by s.product_id
    ) d on d.product_id=vr.product_id
    where vr.order_id=p_order_id
    order by vr.product_id
    for update of vr
  loop
    if r.status='consumed' and coalesce(r.consumed_at,v_now)>=v_cutover then
      v_delta:=r.quantity-r.deliverable_qty;
    else
      v_delta:=-r.deliverable_qty;
    end if;
    if v_delta<>0 then
      select coalesce(stock,0) into v_stock from public.products where id=r.product_id for update;
      if not found then raise exception 'separation_stock_product_missing:%',r.product_id using errcode='P0001'; end if;
      if v_stock+v_delta<0 then
        raise exception 'separation_stock_below_zero:%:%',r.product_id,v_stock+v_delta using errcode='P0001';
      end if;
      update public.products set stock=v_stock+v_delta,updated_at=v_now where id=r.product_id;
    end if;
    if r.deliverable_qty<=0 then
      update public.vitrine_stock_reservations set status='released',released_at=v_now,consumed_at=null,updated_at=v_now where id=r.id;
    else
      update public.vitrine_stock_reservations set quantity=r.deliverable_qty,status='consumed',consumed_at=v_now,released_at=null,updated_at=v_now where id=r.id;
    end if;
  end loop;

  -- Older orders without a reservation row use only the quantities marked as separated.
  -- Historical preassembled quantities remain read from their order-item snapshot.
  for r in
    select s.product_id,
      sum(case when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(0,s.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0))
        else s.quantity end)::numeric as quantity
    from public.order_separation_items_v1 s
    join public.order_items oi on oi.id=s.order_item_id
    where s.order_id=p_order_id and s.state='separated' and s.product_id is not null
      and not exists(select 1 from public.vitrine_stock_reservations vr where vr.order_id=p_order_id and vr.product_id=s.product_id)
    group by s.product_id
  loop
    if r.quantity>0 then
      select coalesce(stock,0) into v_stock from public.products where id=r.product_id for update;
      if not found then raise exception 'separation_stock_product_missing:%',r.product_id using errcode='P0001'; end if;
      if v_stock<r.quantity then raise exception 'separation_stock_below_zero:%:%',r.product_id,v_stock-r.quantity using errcode='P0001'; end if;
      update public.products set stock=v_stock-r.quantity,updated_at=v_now where id=r.product_id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'order_item_id',s.order_item_id,'product_id',s.product_id,'quantity',s.quantity,
    'basket_id',nullif(oi.metadata->>'basket_id',''),'basket_name',nullif(oi.metadata->>'basket_name','')))),'[]'::jsonb)
    into v_missing_components
  from public.order_separation_items_v1 s join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id and s.state='missing';
  update public.order_separation_completions_v1
    set phase='stock_applied',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'stock_applied',true,'stock_authority','supabase','stock_source','products.stock',
      'physical_stock_changed',true,'missing_components',v_missing_components,'stock_applied_at',v_now),updated_at=v_now
    where order_id=p_order_id;
  if v_order_status in ('confirmed','processing') then
    update public.orders set status='ready',updated_at=v_now where id=p_order_id;
    v_order_status:='ready';
  end if;
  return jsonb_build_object('ok',true,'status','stock_applied','stock_authority','supabase',
    'stock_source','products.stock','physical_stock_changed',true,'local_order_status',v_order_status,
    'missing_components',v_missing_components);
end;
$function$


-- Keep marketing callers callable while explicitly retiring the old
-- lot-based commercial catalog that they used for basket offers.
CREATE OR REPLACE FUNCTION public.marketing_strategy_revalidate_commercial_v1(p_strategy_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('ok',false,'error','legacy_commercial_basket_flow_retired',
    'strategy_id',p_strategy_id);
$function$;

-- Retire every public routine belonging to the old lot/recipe flow. The active
-- basket-mold APIs and marketing attribution remain in place.
DO $retire_legacy_basket_lot_functions$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prokind='f'
      AND p.proname NOT IN ('ops2_apply_order_separation_stock_v2','marketing_attribute_order_v1','consume_vitrine_order_stock_v1','marketing_strategy_revalidate_commercial_v1')
      AND (
        p.proname ILIKE '%basket%lot%'
        OR p.proname ILIKE '%lot%basket%'
        OR position('store_basket_' IN p.proname)>0
        OR position('basket_kit_template' IN p.proname)>0
        OR position('basket_commercial' IN p.proname)>0
        OR p.proname IN ('papoai_resolve_basket_intent_v1','papoai_prepare_basket_draft_v1','create_vitrine_cart_order_v1','create_canonical_cart_order_v2_base')
        OR position('basket_stock_lots' IN pg_get_functiondef(p.oid))>0
        OR position('basket_stock_lot_items' IN pg_get_functiondef(p.oid))>0
        OR position('basket_stock_allocations' IN pg_get_functiondef(p.oid))>0
        OR position('basket_lot_' IN pg_get_functiondef(p.oid))>0
        OR position('basket_current_lot_v1' IN pg_get_functiondef(p.oid))>0
        OR position('basket_split_availability_v1' IN pg_get_functiondef(p.oid))>0
        OR position('basket_commercial_catalog_v1' IN pg_get_functiondef(p.oid))>0
        OR position('basket_kit_templates' IN pg_get_functiondef(p.oid))>0
        OR position('store_basket_recipe_kits' IN pg_get_functiondef(p.oid))>0
        OR position('basket_sales_runtime_v1' IN pg_get_functiondef(p.oid))>0
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE',r.signature);
  END LOOP;
END
$retire_legacy_basket_lot_functions$;

-- Remove retired lot records, recipe kits, automation suggestions and settings.
-- Orders and their order_items remain untouched.
DROP TABLE IF EXISTS public.basket_lot_suggestion_items;
DROP TABLE IF EXISTS public.basket_lot_suggestions;
DROP TABLE IF EXISTS public.basket_lot_automation_runs;
DROP TABLE IF EXISTS public.basket_lot_substitution_products;
DROP TABLE IF EXISTS public.basket_lot_substitution_rules;
DROP TABLE IF EXISTS public.basket_lot_component_reservations;
DROP TABLE IF EXISTS public.basket_lot_images;
DROP TABLE IF EXISTS public.basket_stock_allocations;
DROP TABLE IF EXISTS public.basket_stock_lot_items;
DROP TABLE IF EXISTS public.basket_stock_lots;
DROP TABLE IF EXISTS public.basket_lot_automation_settings;
DROP TABLE IF EXISTS public.store_basket_recipe_kits;
DROP TABLE IF EXISTS public.basket_sales_runtime_v1;
DROP TABLE IF EXISTS public.basket_kit_template_items;
DROP TABLE IF EXISTS public.basket_kit_templates;
