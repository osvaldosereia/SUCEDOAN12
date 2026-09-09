begin;

create or replace function public.patch_whatsapp_flow_basket_selection_v1(
  p_basket_id uuid,
  p_selection jsonb,
  p_product_id uuid,
  p_quantity numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.basket_templates%rowtype;
  bi public.basket_template_items%rowtype;
  v_base jsonb;
  v_next jsonb:='[]'::jsonb;
  v_normalized jsonb:='[]'::jsonb;
  x jsonb;
  v_found boolean:=false;
  v_q numeric;
  v_min numeric;
  v_max numeric;
  v_name text;
  v_summary text;
begin
  select * into b from public.basket_templates where id=p_basket_id and is_active=true and is_whatsapp_active=true;
  if not found then raise exception 'basket_not_available'; end if;
  if p_quantity<>trunc(p_quantity) then raise exception 'basket_quantity_must_be_integer'; end if;
  if jsonb_typeof(coalesce(p_selection,'null'::jsonb))<>'array' then
    v_base:=public.get_whatsapp_flow_basket_editor_v1(p_basket_id)->'selection';
  else
    v_base:=p_selection;
  end if;

  for x in select value from jsonb_array_elements(v_base) loop
    begin v_q:=(x->>'quantity')::numeric; exception when others then raise exception 'invalid_basket_selection_quantity'; end;
    if v_q<>trunc(v_q) then raise exception 'basket_quantity_must_be_integer'; end if;
    if coalesce(x->>'product_id','')=p_product_id::text then
      v_q:=p_quantity;
      v_found:=true;
    end if;
    select * into bi from public.basket_template_items bi0
     where bi0.basket_id=p_basket_id and bi0.product_id=(x->>'product_id')::uuid;
    if not found then raise exception 'basket_component_not_found'; end if;
    select p.name into v_name from public.products p where p.id=bi.product_id;
    v_min:=coalesce(bi.min_quantity,case when bi.removable then 0 else bi.quantity end);
    v_max:=coalesce(bi.max_quantity,greatest(bi.quantity,10));
    if v_q<v_min or v_q>v_max then
      return jsonb_build_object('valid',false,'reason','quantity_out_of_range','product_id',bi.product_id,'min',v_min,'max',v_max);
    end if;
    if not bi.quantity_editable and v_q<>bi.quantity then
      return jsonb_build_object('valid',false,'reason','quantity_not_editable','product_id',bi.product_id);
    end if;
    if not bi.removable and v_q=0 then
      return jsonb_build_object('valid',false,'reason','product_not_removable','product_id',bi.product_id);
    end if;
    v_next:=v_next||jsonb_build_array(jsonb_build_object('product_id',bi.product_id,'quantity',trunc(v_q)::integer));
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('product_id',bi.product_id,'name',v_name,'quantity',trunc(v_q)::integer,'base_quantity',bi.quantity,'changed',v_q<>bi.quantity,'removable',bi.removable,'quantity_editable',bi.quantity_editable));
  end loop;
  if not v_found then raise exception 'basket_component_not_found'; end if;

  select coalesce(string_agg(trim(to_char((e->>'quantity')::numeric,'FM999990'))||' × '||coalesce(e->>'name',''),E'\n'),'')
    into v_summary from jsonb_array_elements(v_normalized) e where (e->>'quantity')::numeric>0;

  return jsonb_build_object(
    'valid',true,
    'selection',v_next,
    'normalized',v_normalized,
    'summary',v_summary,
    'write_validation_deferred',true,
    'policy',jsonb_build_object('component_prices_visible',false,'strict_product_validation_on_write',true)
  );
end;
$$;

commit;