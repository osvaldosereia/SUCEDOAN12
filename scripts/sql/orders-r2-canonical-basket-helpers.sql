-- Canonical live functions copied READ-ONLY for isolated R02 checkout basket tests.
-- This is test source code, not a deployable migration.
CREATE OR REPLACE FUNCTION public.basket_group_preserves_original_lot_v1(p_components jsonb, p_group text, p_lot_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with expected as (
    select li.product_id::text product_id,sum(li.quantity_per_basket)::numeric qty
    from public.basket_stock_lot_items li
    where li.lot_id=p_lot_id
    group by li.product_id
  ),
  supplied as (
    select x.value->>'product_id' product_id,
           sum(coalesce(nullif(x.value->>'quantity','')::numeric,0))::numeric qty
    from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) x(value)
    where coalesce(x.value->>'component_group','')=p_group
      and coalesce(x.value->>'product_id','')<>''
    group by x.value->>'product_id'
  ),
  diff as (
    select e.product_id,e.qty expected_qty,coalesce(s.qty,0) supplied_qty
    from expected e
    left join supplied s using(product_id)
  )
  select not exists(
    select 1 from diff where supplied_qty + 0.0001 < expected_qty
  );
$function$
;

CREATE OR REPLACE FUNCTION public.basket_lot_commercial_price_v1(p_basket_id uuid, p_food_lot_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (select l.sale_price_override
       from public.basket_stock_lots l
       join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=p_food_lot_id and k.kind='food' and k.basket_id=p_basket_id),
    (select b.base_price from public.basket_templates b where b.id=p_basket_id),
    0::numeric
  );
$function$
;

CREATE OR REPLACE FUNCTION public.basket_mold_cutover_ready_v1(p_basket_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- Checkout hotfix: mold cards already published by the storefront must remain
  -- purchasable. Stock validation/reservation is still enforced transactionally
  -- by create_vitrine_cart_order_v3_base/reserve_vitrine_order_stock_v1.
  select exists (
    select 1
    from public.basket_molds bm
    join public.basket_templates bt on bt.id = bm.basket_id
    where bm.basket_id = p_basket_id
      and bt.is_active = true
  );
$function$
;
