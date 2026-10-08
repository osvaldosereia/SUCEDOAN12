-- ANA V3 R11: allow storefront_v2 source in canonical stock reservation.
-- Preserve existing stock locks and legacy source types.
do $addon_origin$
declare
  v_def text;
  v_old text:=$old$source in ('vitrine','manual_whatsapp','papoai','reorder')$old$;
  v_new text:=$new$source in ('vitrine','storefront_v2','manual_whatsapp','papoai','reorder')$new$;
begin
  select pg_get_functiondef('public.reserve_vitrine_order_stock_v1(uuid)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 or position(v_new in v_def)>0 then
    raise exception 'addon_reservation_origin_v1: unexpected source allowlist';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$addon_origin$;
