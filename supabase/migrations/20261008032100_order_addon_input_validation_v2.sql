-- ANA V3 R11: validate null product identifiers and quantities before session lookup.
-- Guarded replacement of the existing RPC; fail closed on schema drift.
-- This migration does not modify order, stock or session rows.
do $addon_input_guard$
declare
  v_def text;
  v_old_product text := $old$    begin
      v_product_id:=(v_line->>'product_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_product_id');
    end;$old$;
  v_new_product text := $new$    begin
      v_product_id:=(v_line->>'product_id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'error','invalid_product_id');
    end;
    if v_product_id is null then
      return jsonb_build_object('ok',false,'error','invalid_product_id');
    end if;$new$;
  v_old_qty text := 'if v_qty<=0 or v_qty>30 or trunc(v_qty)<>v_qty then';
  v_new_qty text := 'if v_qty is null or v_qty<=0 or v_qty>30 or trunc(v_qty)<>v_qty then';
begin
  select pg_get_functiondef('public.ops3_add_items_to_existing_order_v1(text,text,jsonb)'::regprocedure)
    into v_def;
  if position(v_old_product in v_def)=0 or position(v_old_qty in v_def)=0
     or position(v_new_product in v_def)>0 or position(v_new_qty in v_def)>0 then
    raise exception 'addon_input_guard_v2: unexpected function definition';
  end if;
  v_def := replace(v_def,v_old_product,v_new_product);
  v_def := replace(v_def,v_old_qty,v_new_qty);
  execute v_def;
end;
$addon_input_guard$;
