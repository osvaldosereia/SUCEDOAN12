-- Dona Antônia · Cestas/Kits: posições guiadas de composição v1
-- O modelo define termos/famílias e produtos-base sem reservar estoque.
begin;

alter table public.basket_kit_template_items add column if not exists position_label text;
alter table public.basket_kit_template_items add column if not exists family_key text;
alter table public.basket_kit_template_items add column if not exists search_query text;

-- Reaproveita somente famílias explicitamente cadastradas. O restante usa busca textual.
update public.basket_kit_template_items i
set family_key=m.family_key,
    updated_at=now()
from public.basket_lot_substitution_products m
where m.product_id=i.product_id
  and nullif(btrim(coalesce(i.family_key,'')),'') is null;

update public.basket_kit_template_items i
set position_label=coalesce(
      nullif(btrim((select r.label from public.basket_lot_substitution_rules r where r.family_key=i.family_key)),''),
      p.name
    ),
    search_query=case when nullif(btrim(coalesce(i.family_key,'')),'') is null then p.name else null end,
    updated_at=now()
from public.products p
where p.id=i.product_id
  and (
    nullif(btrim(coalesce(i.position_label,'')),'') is null
    or (nullif(btrim(coalesce(i.family_key,'')),'') is null and nullif(btrim(coalesce(i.search_query,'')),'') is null)
  );

create or replace function public.basket_commercial_model_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_basket public.basket_templates%rowtype;
  v_kit public.basket_kit_templates%rowtype;
  v_positions jsonb;
begin
  select * into v_basket
  from public.basket_templates
  where id=p_basket_id;
  if not found then raise exception 'basket_not_found'; end if;

  select * into v_kit
  from public.basket_kit_templates
  where basket_id=p_basket_id
  order by is_active desc,sort_order,created_at,id
  limit 1;
  if not found then raise exception 'basket_kit_template_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'product_id',i.product_id,
    'product_name',p.name,
    'sku',p.sku,
    'gtin',p.gtin,
    'packaging',p.packaging,
    'image_url',p.image_url,
    'price',p.price,
    'quantity',i.quantity,
    'removable',i.removable,
    'quantity_editable',i.quantity_editable,
    'min_quantity',i.min_quantity,
    'max_quantity',i.max_quantity,
    'remove_unit_delta',i.remove_unit_delta,
    'add_unit_delta',i.add_unit_delta,
    'sort_order',i.sort_order,
    'position_label',coalesce(nullif(btrim(i.position_label),''),r.label,p.name),
    'family_key',i.family_key,
    'family_label',r.label,
    'family_enabled',r.enabled,
    'search_query',coalesce(nullif(btrim(i.search_query),''),case when i.family_key is null then p.name else null end)
  ) order by i.sort_order,i.id),'[]'::jsonb)
  into v_positions
  from public.basket_kit_template_items i
  join public.products p on p.id=i.product_id
  left join public.basket_lot_substitution_rules r on r.family_key=i.family_key
  where i.kit_template_id=v_kit.id;

  return jsonb_build_object(
    'ok',true,
    'basket',jsonb_build_object(
      'id',v_basket.id,'name',v_basket.name,'base_price',v_basket.base_price,
      'category_id',v_basket.category_id,'image_url',v_basket.image_url,
      'is_active',v_basket.is_active,'hidden_adjustment',v_basket.hidden_adjustment
    ),
    'kit_template',jsonb_build_object(
      'id',v_kit.id,'name',v_kit.name,'code_prefix',v_kit.code_prefix,
      'kind',v_kit.kind,'is_active',v_kit.is_active
    ),
    'positions',v_positions
  );
end;
$function$;

create or replace function public.save_basket_commercial_model_composition_v1(
  p_basket_id uuid,
  p_positions jsonb,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kit public.basket_kit_templates%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_saved_id uuid;
  v_product_id uuid;
  v_product_text text;
  v_qty numeric;
  v_min numeric;
  v_max numeric;
  v_remove_delta numeric;
  v_add_delta numeric;
  v_label text;
  v_family text;
  v_search text;
  v_removable boolean;
  v_qty_editable boolean;
  v_duplicate_confirmed boolean;
  v_position integer:=0;
  v_keep_ids uuid[]:=array[]::uuid[];
  v_seen_products uuid[]:=array[]::uuid[];
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
begin
  if p_basket_id is null then raise exception 'basket_required'; end if;
  if not exists(select 1 from public.basket_templates where id=p_basket_id and is_active=true) then
    raise exception 'basket_not_found';
  end if;

  select * into v_kit
  from public.basket_kit_templates
  where basket_id=p_basket_id and is_active=true
  order by sort_order,created_at,id
  limit 1
  for update;
  if not found then raise exception 'basket_kit_template_not_found'; end if;

  if jsonb_typeof(coalesce(p_positions,'null'::jsonb))<>'array'
     or jsonb_array_length(p_positions)<1
     or jsonb_array_length(p_positions)>120 then
    raise exception 'basket_positions_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_positions)
  loop
    v_product_text:=btrim(coalesce(v_item->>'product_id',''));
    if v_product_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'position_product_invalid';
    end if;
    v_product_id:=v_product_text::uuid;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'position_product_unavailable';
    end if;

    begin v_duplicate_confirmed:=coalesce((v_item->>'duplicate_confirmed')::boolean,false);
    exception when others then raise exception 'position_duplicate_confirmation_invalid'; end;
    if v_product_id=any(v_seen_products) and not v_duplicate_confirmed then
      raise exception 'duplicate_product_confirmation_required';
    end if;
    v_seen_products:=array_append(v_seen_products,v_product_id);

    v_label:=btrim(coalesce(v_item->>'position_label',''));
    if char_length(v_label)<1 or char_length(v_label)>80 then raise exception 'position_label_invalid'; end if;

    v_family:=nullif(btrim(coalesce(v_item->>'family_key','')),'');
    if v_family is not null then
      if not exists(select 1 from public.basket_lot_substitution_rules where family_key=v_family) then
        raise exception 'position_family_invalid';
      end if;
      if not exists(
        select 1 from public.basket_lot_substitution_products
        where product_id=v_product_id and family_key=v_family
      ) then raise exception 'position_product_not_in_family'; end if;
    end if;

    v_search:=nullif(btrim(coalesce(v_item->>'search_query','')),'');
    if v_search is not null and char_length(v_search)>160 then raise exception 'position_search_invalid'; end if;
    if v_family is null and v_search is null then v_search:=v_label; end if;

    begin v_qty:=(v_item->>'quantity')::numeric;
    exception when others then raise exception 'position_quantity_invalid'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'position_quantity_invalid'; end if;

    begin v_min:=coalesce(nullif(v_item->>'min_quantity','')::numeric,0);
    exception when others then raise exception 'position_min_quantity_invalid'; end;
    begin v_max:=nullif(v_item->>'max_quantity','')::numeric;
    exception when others then raise exception 'position_max_quantity_invalid'; end;
    if v_min<0 or v_min>100 then raise exception 'position_min_quantity_invalid'; end if;
    if v_max is not null and (v_max<v_min or v_max>100) then raise exception 'position_max_quantity_invalid'; end if;
    if v_qty<v_min or (v_max is not null and v_qty>v_max) then raise exception 'position_quantity_out_of_bounds'; end if;

    begin v_remove_delta:=nullif(v_item->>'remove_unit_delta','')::numeric;
    exception when others then raise exception 'position_remove_delta_invalid'; end;
    begin v_add_delta:=nullif(v_item->>'add_unit_delta','')::numeric;
    exception when others then raise exception 'position_add_delta_invalid'; end;
    begin v_removable:=coalesce((v_item->>'removable')::boolean,true);
    exception when others then raise exception 'position_removable_invalid'; end;
    begin v_qty_editable:=coalesce((v_item->>'quantity_editable')::boolean,true);
    exception when others then raise exception 'position_quantity_editable_invalid'; end;

    v_item_id:=null;
    if nullif(btrim(coalesce(v_item->>'id','')),'') is not null then
      begin v_item_id:=(v_item->>'id')::uuid;
      exception when others then raise exception 'position_id_invalid'; end;
    end if;

    v_saved_id:=null;
    if v_item_id is not null then
      update public.basket_kit_template_items
      set product_id=v_product_id,
          quantity=v_qty,
          removable=v_removable,
          quantity_editable=v_qty_editable,
          min_quantity=v_min,
          max_quantity=v_max,
          remove_unit_delta=v_remove_delta,
          add_unit_delta=v_add_delta,
          sort_order=v_position,
          position_label=v_label,
          family_key=v_family,
          search_query=v_search,
          updated_at=now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('guided_position',true,'last_edit_by',v_operator)
      where id=v_item_id and kit_template_id=v_kit.id
      returning id into v_saved_id;
      if v_saved_id is null then raise exception 'position_not_found'; end if;
    else
      insert into public.basket_kit_template_items(
        kit_template_id,product_id,quantity,removable,quantity_editable,
        min_quantity,max_quantity,remove_unit_delta,add_unit_delta,sort_order,
        position_label,family_key,search_query,metadata,updated_at
      ) values (
        v_kit.id,v_product_id,v_qty,v_removable,v_qty_editable,
        v_min,v_max,v_remove_delta,v_add_delta,v_position,
        v_label,v_family,v_search,jsonb_build_object('guided_position',true,'created_by',v_operator),now()
      ) returning id into v_saved_id;
    end if;

    v_keep_ids:=array_append(v_keep_ids,v_saved_id);
    v_position:=v_position+1;
  end loop;

  delete from public.basket_kit_template_items
  where kit_template_id=v_kit.id
    and not (id=any(v_keep_ids));

  update public.basket_kit_templates
  set updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'guided_positions_v1',true,'last_model_edit_at',now(),'last_model_edit_by',v_operator
      )
  where id=v_kit.id;

  return jsonb_build_object('ok',true,'basket_id',p_basket_id,'kit_template_id',v_kit.id,'item_count',cardinality(v_keep_ids));
end;
$function$;

revoke all on function public.basket_commercial_model_editor_v1(uuid) from public,anon,authenticated;
grant execute on function public.basket_commercial_model_editor_v1(uuid) to service_role;
revoke all on function public.save_basket_commercial_model_composition_v1(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_basket_commercial_model_composition_v1(uuid,jsonb,text) to service_role;

commit;
