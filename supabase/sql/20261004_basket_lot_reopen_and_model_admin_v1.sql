begin;

create or replace function public.reopen_basket_kit_lot_for_edit_v1(
  p_lot_id uuid,
  p_operator text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_history_count integer := 0;
begin
  select * into v_lot
  from public.basket_stock_lots
  where id=p_lot_id
  for update;

  if not found then raise exception 'lot_not_found'; end if;
  if v_lot.kit_template_id is null then raise exception 'kit_lot_required'; end if;

  if v_lot.status='draft' then
    return jsonb_build_object(
      'lot_id',v_lot.id,
      'short_code',v_lot.short_code,
      'status','draft',
      'already_editing',true
    );
  end if;

  if v_lot.status<>'ready' then raise exception 'lot_not_editable'; end if;
  if coalesce(v_lot.sale_enabled,false) then raise exception 'lot_sale_must_be_disabled'; end if;
  if coalesce(v_lot.quantity_available,0)<>coalesce(v_lot.quantity_built,0)
     or coalesce(v_lot.quantity_dismantled,0)>0 then
    raise exception 'lot_already_changed';
  end if;

  select count(*) into v_history_count
  from public.basket_stock_allocations a
  where a.lot_id=p_lot_id;
  if v_history_count>0 then raise exception 'lot_has_order_history'; end if;

  if exists(
    select 1
    from public.basket_stock_lots d
    where d.id<>p_lot_id
      and d.status='ready'
      and coalesce(d.quantity_available,0)>0
      and (d.linked_lot_id=p_lot_id or d.linked_hygiene_lot_id=p_lot_id)
  ) then
    raise exception 'lot_is_dependency';
  end if;

  update public.basket_stock_lots
  set status='draft',
      quantity_available=0,
      sale_enabled=false,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'reopened_for_edit_at',now(),
        'reopened_for_edit_by',nullif(btrim(coalesce(p_operator,'')),'')
      )
  where id=p_lot_id;

  return jsonb_build_object(
    'lot_id',v_lot.id,
    'short_code',v_lot.short_code,
    'status','draft',
    'already_editing',false
  );
end;
$function$;

create or replace function public.save_basket_kit_template_admin_v1(
  p_kit_template_id uuid,
  p_name text,
  p_code_prefix text,
  p_items jsonb,
  p_operator text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_prefix text := upper(btrim(coalesce(p_code_prefix,'')));
  v_item jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_source_id uuid;
  v_product_text text;
  v_item_text text;
  v_source_text text;
  v_qty numeric;
  v_position integer := 0;
  v_keep_ids uuid[] := array[]::uuid[];
  v_seen_products text[] := array[]::text[];
  v_saved_id uuid;
begin
  if not exists(
    select 1 from public.basket_kit_templates
    where id=p_kit_template_id and is_active=true
  ) then raise exception 'kit_template_not_found'; end if;

  if char_length(v_name)<1 or char_length(v_name)>180 then raise exception 'kit_template_name_invalid'; end if;
  if v_prefix !~ '^[A-Z]{2}$' then raise exception 'kit_template_prefix_invalid'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>120 then
    raise exception 'kit_template_items_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_text:=btrim(coalesce(v_item->>'product_id',''));
    if v_product_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'kit_template_product_invalid';
    end if;
    v_product_id:=v_product_text::uuid;

    if v_product_text=any(v_seen_products) then raise exception 'kit_template_product_duplicate'; end if;
    v_seen_products:=array_append(v_seen_products,v_product_text);

    if not exists(select 1 from public.products p where p.id=v_product_id and p.is_active=true) then
      raise exception 'kit_template_product_unavailable';
    end if;

    if coalesce(v_item->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'kit_template_quantity_invalid'; end if;
    v_qty:=(v_item->>'quantity')::numeric;
    if v_qty<1 or v_qty>100 then raise exception 'kit_template_quantity_invalid'; end if;

    v_item_text:=btrim(coalesce(v_item->>'id',''));
    v_item_id:=null;
    if v_item_text<>'' then
      if v_item_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'kit_template_item_invalid';
      end if;
      v_item_id:=v_item_text::uuid;
    end if;

    v_source_text:=btrim(coalesce(v_item->>'source_template_item_id',''));
    v_source_id:=null;
    if v_source_text<>'' then
      if v_source_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'kit_template_source_item_invalid';
      end if;
      v_source_id:=v_source_text::uuid;
    end if;

    v_saved_id:=null;
    if v_item_id is not null then
      update public.basket_kit_template_items
      set product_id=v_product_id,
          source_template_item_id=v_source_id,
          quantity=v_qty,
          sort_order=v_position,
          updated_at=now()
      where id=v_item_id and kit_template_id=p_kit_template_id
      returning id into v_saved_id;
    end if;

    if v_saved_id is null then
      insert into public.basket_kit_template_items(
        kit_template_id,product_id,source_template_item_id,quantity,sort_order,updated_at
      ) values(
        p_kit_template_id,v_product_id,v_source_id,v_qty,v_position,now()
      ) returning id into v_saved_id;
    end if;

    v_keep_ids:=array_append(v_keep_ids,v_saved_id);
    v_position:=v_position+1;
  end loop;

  delete from public.basket_kit_template_items
  where kit_template_id=p_kit_template_id
    and not (id=any(v_keep_ids));

  update public.basket_kit_templates
  set name=v_name,
      code_prefix=v_prefix,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_model_edit_at',now(),
        'last_model_edit_by',nullif(btrim(coalesce(p_operator,'')),'')
      )
  where id=p_kit_template_id;

  return jsonb_build_object(
    'id',p_kit_template_id,
    'name',v_name,
    'code_prefix',v_prefix,
    'item_count',cardinality(v_keep_ids)
  );
end;
$function$;

create or replace function public.archive_basket_kit_template_admin_v1(
  p_kit_template_id uuid,
  p_operator text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_row public.basket_kit_templates%rowtype;
begin
  select * into v_row
  from public.basket_kit_templates
  where id=p_kit_template_id
  for update;
  if not found then raise exception 'kit_template_not_found'; end if;

  if exists(
    select 1 from public.basket_stock_lots l
    where l.kit_template_id=p_kit_template_id
      and (l.status='draft' or (l.status='ready' and coalesce(l.quantity_available,0)>0))
  ) then raise exception 'kit_template_has_live_lots'; end if;

  update public.basket_kit_templates
  set is_active=false,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'archived_at',now(),
        'archived_by',nullif(btrim(coalesce(p_operator,'')),'')
      )
  where id=p_kit_template_id;

  return jsonb_build_object('id',p_kit_template_id,'archived',true);
end;
$function$;

create or replace function public.archive_basket_template_admin_v1(
  p_basket_id uuid,
  p_operator text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_row public.basket_templates%rowtype;
begin
  select * into v_row
  from public.basket_templates
  where id=p_basket_id
  for update;
  if not found then raise exception 'basket_not_found'; end if;

  if exists(
    select 1 from public.basket_kit_templates k
    where k.basket_id=p_basket_id and k.is_active=true
  ) then raise exception 'basket_has_active_kit_templates'; end if;

  if exists(
    select 1 from public.basket_stock_lots l
    where l.basket_id=p_basket_id
      and (l.status='draft' or (l.status='ready' and coalesce(l.quantity_available,0)>0))
  ) then raise exception 'basket_has_live_lots'; end if;

  update public.basket_templates
  set is_active=false,
      is_whatsapp_active=false,
      updated_at=now(),
      internal_notes=concat_ws(E'\n',nullif(internal_notes,''),'Modelo arquivado em '||now()::text||coalesce(' por '||nullif(btrim(coalesce(p_operator,'')),''),''))
  where id=p_basket_id;

  return jsonb_build_object('id',p_basket_id,'archived',true);
end;
$function$;

commit;
