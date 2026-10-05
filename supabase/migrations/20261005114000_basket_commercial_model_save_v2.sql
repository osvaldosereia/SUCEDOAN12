-- Dona Antônia · Cestas/Kits: salvamento comercial canônico v2
create or replace function public.save_basket_commercial_model_v2(
  p_basket_id uuid,
  p_name text,
  p_category_id uuid,
  p_base_price numeric,
  p_image_url text,
  p_positions jsonb,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_basket public.basket_templates%rowtype;
  v_name text:=btrim(coalesce(p_name,''));
  v_image text:=nullif(btrim(coalesce(p_image_url,'')),'');
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_composition jsonb;
begin
  if p_basket_id is null then raise exception 'basket_required'; end if;
  select * into v_basket from public.basket_templates where id=p_basket_id for update;
  if not found or v_basket.is_active is not true then raise exception 'basket_not_found'; end if;

  if char_length(v_name)<1 or char_length(v_name)>180 then raise exception 'basket_name_invalid'; end if;
  if p_category_id is null or not exists(
    select 1 from public.basket_categories c where c.id=p_category_id and c.is_active=true
  ) then raise exception 'basket_category_required'; end if;
  if p_base_price is null or p_base_price<0 or p_base_price>9999999 then raise exception 'basket_price_invalid'; end if;
  if v_image is not null and char_length(v_image)>1000 then raise exception 'basket_image_invalid'; end if;

  v_composition:=public.save_basket_commercial_model_composition_v1(
    p_basket_id,
    p_positions,
    v_operator
  );

  update public.basket_templates
  set name=v_name,
      category_id=p_category_id,
      base_price=round(p_base_price::numeric,2),
      image_url=v_image,
      updated_at=now()
  where id=p_basket_id;

  update public.basket_kit_templates
  set name=v_name,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_commercial_edit_at',now(),
        'last_commercial_edit_by',v_operator
      )
  where basket_id=p_basket_id and is_active=true;

  return jsonb_build_object(
    'ok',true,
    'basket_id',p_basket_id,
    'name',v_name,
    'category_id',p_category_id,
    'base_price',round(p_base_price::numeric,2),
    'image_url',v_image,
    'item_count',coalesce((v_composition->>'item_count')::integer,0)
  );
end;
$function$;

revoke all on function public.save_basket_commercial_model_v2(uuid,text,uuid,numeric,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_basket_commercial_model_v2(uuid,text,uuid,numeric,text,jsonb,text) to service_role;
