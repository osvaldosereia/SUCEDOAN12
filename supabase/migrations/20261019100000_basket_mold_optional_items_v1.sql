-- Basket extras are separate from mandatory positions. They never affect the
-- basket's hidden adjustment or its base composition.
begin;

create or replace function public.enforce_basket_mold_position_option_limit_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.position_id::text, 0));
  select count(*) into v_count from public.basket_mold_position_options where position_id = new.position_id;
  if v_count >= 3 then raise exception 'basket_mold_position_options_limit'; end if;
  return new;
end;
$function$;

drop trigger if exists basket_mold_position_options_limit_v1 on public.basket_mold_position_options;
create trigger basket_mold_position_options_limit_v1
before insert on public.basket_mold_position_options
for each row execute function public.enforce_basket_mold_position_option_limit_v1();

create or replace function public.admin_basket_mold_optional_items_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_mold public.basket_molds%rowtype;
  v_basket public.basket_templates%rowtype;
  v_items jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active and a.role <> 'viewer'
  ) then raise exception 'admin_not_authorized'; end if;

  select * into v_basket from public.basket_templates where id = p_basket_id;
  select * into v_mold from public.basket_molds where basket_id = p_basket_id;
  if v_basket.id is null or v_mold.id is null then raise exception 'basket_mold_basket_not_found'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.item->>'id',
      'label', e.item->>'label',
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', p.id, 'name', p.name, 'sku', p.sku, 'gtin', p.gtin,
          'image_url', p.image_url, 'packaging', p.packaging
        ) order by o.ordinality)
        from jsonb_array_elements_text(coalesce(e.item->'product_ids','[]'::jsonb)) with ordinality o(product_id, ordinality)
        join public.products p on p.id = o.product_id::uuid and p.is_active = true
      ), '[]'::jsonb)
    ) order by e.ordinality
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_mold.metadata->'optional_items','[]'::jsonb)) with ordinality e(item, ordinality);

  return jsonb_build_object('basket_id', v_basket.id, 'basket_name', v_basket.name, 'items', v_items);
end;
$function$;

create or replace function public.admin_save_basket_mold_optional_items_v1(p_basket_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product text;
  v_seen text[];
  v_clean jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_label text;
  v_options jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active and a.role <> 'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if not exists (select 1 from public.basket_molds where basket_id = p_basket_id) then
    raise exception 'basket_mold_basket_not_found';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then
    raise exception 'basket_mold_optional_items_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    v_label := btrim(coalesce(v_item->>'label',''));
    v_options := coalesce(v_item->'options','[]'::jsonb);
    if v_label = '' or char_length(v_label) > 120 then raise exception 'basket_mold_optional_label_invalid'; end if;
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 1 or jsonb_array_length(v_options) > 3 then
      raise exception 'basket_mold_optional_options_limit';
    end if;
    v_seen := array[]::text[];
    for v_product in select value from jsonb_array_elements_text(v_options) loop
      if v_product !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'basket_mold_optional_product_invalid';
      end if;
      if v_product = any(v_seen)
        or not exists (select 1 from public.products p where p.id = v_product::uuid and p.is_active = true) then
        raise exception 'basket_mold_optional_product_invalid';
      end if;
      v_seen := array_append(v_seen, v_product);
    end loop;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'id', case when coalesce(v_item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_item->>'id' else gen_random_uuid()::text end,
      'label', v_label,
      'product_ids', to_jsonb(v_seen)
    ));
  end loop;

  update public.basket_molds
  set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{optional_items}', v_clean, true), updated_at = now()
  where basket_id = p_basket_id;

  return jsonb_build_object('basket_id', p_basket_id, 'items', v_clean);
end;
$function$;

revoke all on function public.admin_basket_mold_optional_items_editor_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_basket_mold_optional_items_editor_v1(uuid) to authenticated;
revoke all on function public.admin_save_basket_mold_optional_items_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_basket_mold_optional_items_v1(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
