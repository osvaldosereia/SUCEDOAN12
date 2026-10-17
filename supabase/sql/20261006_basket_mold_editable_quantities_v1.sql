do $patch$
declare
  v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;

  v_old := $old$        v_selected_qty:=v_mold_position.quantity;$old$;
  v_new := $new$        begin
          v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,v_mold_position.quantity);
        exception when others then raise exception 'invalid_basket_quantity'; end;
        if v_selected_qty<0 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_mold_editable_qty_anchor_missing'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$        if coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then raise exception 'insufficient_stock'; end if;$old$;
  v_new := $new$        if coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then raise exception 'insufficient_stock'; end if;
        if v_selected_qty=0 then
          v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
            'position_id',v_mold_position.id,'label',v_mold_position.label,
            'product_id',v_product.id,'quantity',0
          ));
          continue;
        end if;$new$;
  if position(v_old in v_def)=0 then raise exception 'basket_mold_zero_qty_anchor_missing'; end if;
  v_def := replace(v_def,v_old,v_new);

  execute v_def;
end
$patch$;
