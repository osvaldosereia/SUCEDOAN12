CREATE OR REPLACE FUNCTION public.enforce_zero_stock_inactive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_authority text:='legacy_shadow';
  v_keep_active boolean:=false;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;
  v_authority:=coalesce(v_authority,'legacy_shadow');

  if new.stock is not null and new.stock<=0 then
    v_keep_active:=public.handle_basket_product_unavailable_v1(new.id);
    if v_keep_active then
      new.is_active:=true;
      new.is_whatsapp_active:=false;
    elsif v_authority<>'bling' then
      new.is_active:=false;
      new.is_whatsapp_active:=false;
    end if;
  elsif new.is_active is false then
    v_keep_active:=public.handle_basket_product_unavailable_v1(new.id);
    if v_keep_active then
      new.is_active:=true;
      new.is_whatsapp_active:=false;
    end if;
  elsif exists(
    select 1
    from public.basket_mold_position_options opt
    join public.basket_mold_positions pos on pos.id=opt.position_id
    join public.basket_molds mold on mold.id=pos.mold_id
    join public.basket_templates basket on basket.id=mold.basket_id and basket.is_active=true
    where opt.product_id=new.id
      and coalesce(public.basket_component_fresh_sellable_stock_v1(new.id),0)<pos.quantity
  ) then
    -- Bling-backed sellable stock can reach zero while products.stock stays positive.
    v_keep_active:=public.handle_basket_product_unavailable_v1(new.id);
    if v_keep_active then
      new.is_active:=true;
      new.is_whatsapp_active:=false;
    end if;
  end if;

  return new;
end
$function$;

-- Re-run the same reconciliation for active basket products whose effective stock is short.
UPDATE public.products p
SET stock=p.stock
WHERE EXISTS(
  SELECT 1
  FROM public.basket_mold_position_options opt
  JOIN public.basket_mold_positions pos ON pos.id=opt.position_id
  JOIN public.basket_molds mold ON mold.id=pos.mold_id
  JOIN public.basket_templates basket ON basket.id=mold.basket_id AND basket.is_active=true
  WHERE opt.product_id=p.id
    AND (p.is_active=false OR coalesce(public.basket_component_fresh_sellable_stock_v1(p.id),0)<pos.quantity)
);

CREATE OR REPLACE FUNCTION public.basket_mold_manual_replacement_review_v1(p_basket_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
with requested as (
  select b.id,b.name
  from public.basket_templates b
  where b.is_active=true and (p_basket_ids is null or b.id=any(p_basket_ids))
), positions as (
  select b.id as basket_id,b.name as basket_name,pos.id as position_id,pos.label,
         pos.sort_order as position_order,pos.quantity,opt.id as option_id,
         opt.product_id,opt.sort_order as option_order,coalesce(opt.metadata,'{}'::jsonb) as option_metadata
  from requested b
  join public.basket_molds mold on mold.basket_id=b.id
  join public.basket_mold_positions pos on pos.mold_id=mold.id
  join public.basket_mold_position_options opt on opt.position_id=pos.id
), persisted_review as (
  select basket_id,basket_name,position_id,label,position_order,product_id,
         coalesce(option_metadata->>'manual_replacement_reason','manual_review_required') as reason
  from positions
  where option_metadata @> '{"manual_replacement_required":true}'::jsonb
), unavailable_position_review as (
  select distinct on (p.position_id)
         p.basket_id,p.basket_name,p.position_id,p.label,p.position_order,
         p.product_id,'no_sellable_option'::text as reason
  from positions p
  where not exists(
    select 1
    from positions option_row
    join public.products product on product.id=option_row.product_id
    where option_row.position_id=p.position_id
      and product.is_active=true
      and coalesce(public.basket_component_fresh_sellable_stock_v1(product.id),0)>=p.quantity
  )
  and not exists(
    select 1 from persisted_review existing
    where existing.position_id=p.position_id
  )
  order by p.position_id,
           case when p.option_metadata @> '{"preferred":true}'::jsonb then 0 else 1 end,
           p.option_order,p.product_id
), review_rows as (
  select * from persisted_review
  union all
  select * from unavailable_position_review
)
select coalesce(jsonb_agg(jsonb_build_object(
  'basket_id',basket_id,'basket_name',basket_name,'position_id',position_id,
  'position_label',label,'product_id',product_id,'reason',reason
) order by basket_name,position_order,product_id),'[]'::jsonb)
from review_rows;
$function$;

REVOKE ALL ON FUNCTION public.basket_mold_manual_replacement_review_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_mold_manual_replacement_review_v1(uuid[]) TO service_role;
