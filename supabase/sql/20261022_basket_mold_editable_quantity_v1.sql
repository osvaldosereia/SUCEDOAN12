-- Bound customer-selected mold quantities in the existing canonical checkout validator.
begin;

do $patch$
declare
  v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old text := $old$if v_selected_qty<0 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;$old$;
  v_new text := $new$if v_selected_qty<1 or v_selected_qty>1000 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;$new$;
begin
  select pg_get_functiondef(v_target) into v_def;
  if position(v_old in v_def)=0 then
    if position('v_selected_qty<1 or v_selected_qty>1000' in v_def)>0 then return; end if;
    raise exception 'basket_mold_editable_quantity_validation_anchor_missing';
  end if;
  execute replace(v_def,v_old,v_new);
end
$patch$;

revoke all on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) to service_role;

commit;
