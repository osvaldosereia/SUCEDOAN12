-- R6 hardening: complete lot tracking must reconcile to Bling physical stock,
-- and expired lots remain visible after their status changes.

create or replace view public.ops2_product_lot_summary_v1 as
with lots as (
  select
    l.product_id,
    count(*) filter(where l.status not in ('cancelled')) as lot_count,
    count(*) filter(where l.status not in ('cancelled') and l.quantity_on_hand is not null) as quantified_lot_count,
    count(*) filter(where l.status not in ('cancelled') and l.quantity_on_hand is null) as unquantified_lot_count,
    coalesce(sum(coalesce(l.quantity_on_hand,0))
      filter(where l.status not in ('cancelled')),0)::numeric(14,3) as tracked_physical_qty,
    coalesce(sum(greatest(coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0),0))
      filter(where l.status='active' and l.expiration_date>=current_date and l.quantity_on_hand is not null),0)::numeric(14,3) as sellable_lot_qty,
    coalesce(sum(greatest(coalesce(l.quantity_on_hand,0)-coalesce(l.quantity_reserved,0),0))
      filter(where l.status in ('active','expired') and l.expiration_date<current_date and l.quantity_on_hand is not null),0)::numeric(14,3) as expired_lot_qty,
    min(l.expiration_date)
      filter(where l.status='active' and l.expiration_date>=current_date
             and (l.quantity_on_hand is null or greatest(l.quantity_on_hand-l.quantity_reserved,0)>0)) as earliest_sellable_expiration,
    min(l.expiration_date)
      filter(where l.status in ('active','expired') and l.expiration_date<current_date
             and (l.quantity_on_hand is null or greatest(l.quantity_on_hand-l.quantity_reserved,0)>0)) as earliest_expired_expiration
  from public.product_inventory_lots l
  group by l.product_id
)
select
  p.id as product_id,
  p.name,
  p.is_active,
  p.price,
  p.validity_date as legacy_validity_date,
  coalesce((p.metadata->>'lot_tracking_complete')::boolean,false) as lot_tracking_complete,
  coalesce(l.lot_count,0) as lot_count,
  coalesce(l.quantified_lot_count,0) as quantified_lot_count,
  coalesce(l.unquantified_lot_count,0) as unquantified_lot_count,
  coalesce(l.tracked_physical_qty,0)::numeric(14,3) as tracked_physical_qty,
  coalesce(l.sellable_lot_qty,0)::numeric(14,3) as sellable_lot_qty,
  coalesce(l.expired_lot_qty,0)::numeric(14,3) as expired_lot_qty,
  l.earliest_sellable_expiration,
  l.earliest_expired_expiration,
  s.sellable_physical as bling_physical_qty,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then l.earliest_sellable_expiration
    else p.validity_date
  end as effective_expiration_date,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then (l.earliest_sellable_expiration is not null)
    else (p.validity_date is null or p.validity_date>=current_date)
  end as has_sellable_validity,
  case
    when coalesce((p.metadata->>'lot_tracking_complete')::boolean,false)
      then (l.earliest_sellable_expiration is null and coalesce(l.expired_lot_qty,0)>0)
    else (p.validity_date is not null and p.validity_date<current_date)
  end as expiry_deactivation_candidate
from public.products p
left join lots l on l.product_id=p.id
left join public.ops2_sellable_stock_v1 s on s.product_id=p.id;

create or replace view public.ops2_expiry_offer_policy_v1 as
select
  s.*,
  case when s.effective_expiration_date is null then null
       else (s.effective_expiration_date-current_date) end as days_to_expiry,
  case
    when s.effective_expiration_date is null then null
    when s.effective_expiration_date<current_date then null
    when s.effective_expiration_date<current_date+30 then 40
    when s.effective_expiration_date<current_date+60 then 20
    when s.effective_expiration_date<=current_date+90 then 10
    else null
  end as recommended_discount_percent
from public.ops2_product_lot_summary_v1 s;

create or replace function public.ops2_set_lot_tracking_complete_v1(
  p_product_id uuid,
  p_complete boolean,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_count integer;
  v_unquantified integer;
  v_tracked numeric(14,3);
  v_bling_physical numeric(14,3);
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;

  select
    count(*) filter(where status not in ('cancelled')),
    count(*) filter(where status not in ('cancelled') and quantity_on_hand is null),
    coalesce(sum(coalesce(quantity_on_hand,0)) filter(where status not in ('cancelled')),0)
  into v_count,v_unquantified,v_tracked
  from public.product_inventory_lots
  where product_id=p_product_id;

  select sellable_physical into v_bling_physical
  from public.ops2_sellable_stock_v1
  where product_id=p_product_id;

  if p_complete then
    if v_count=0 then raise exception 'lot_tracking_requires_lot'; end if;
    if v_unquantified>0 then raise exception 'lot_tracking_has_unquantified_lot'; end if;
    if v_bling_physical is null then raise exception 'lot_tracking_bling_physical_missing'; end if;
    if abs(coalesce(v_tracked,0)-coalesce(v_bling_physical,0))>0.001 then
      raise exception 'lot_tracking_physical_mismatch tracked=% bling=%',v_tracked,v_bling_physical;
    end if;
  end if;

  update public.products
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'lot_tracking_complete',coalesce(p_complete,false),
       'lot_tracking_updated_at',now(),
       'lot_tracking_updated_by',nullif(trim(coalesce(p_operator,'')),''),
       'lot_tracking_physical_qty',v_tracked,
       'lot_tracking_bling_physical_qty',v_bling_physical
     ),
     updated_at=now()
   where id=p_product_id;

  return jsonb_build_object(
    'ok',true,'product_id',p_product_id,'lot_tracking_complete',coalesce(p_complete,false),
    'lots',v_count,'unquantified_lots',v_unquantified,
    'tracked_physical_qty',v_tracked,'bling_physical_qty',v_bling_physical
  );
end;
$$;

revoke all on function public.ops2_set_lot_tracking_complete_v1(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ops2_set_lot_tracking_complete_v1(uuid,boolean,text) to service_role;