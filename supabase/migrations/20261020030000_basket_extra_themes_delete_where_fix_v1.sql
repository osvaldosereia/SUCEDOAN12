begin;

create or replace function public.admin_save_basket_extra_themes_v1(p_themes jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_theme jsonb;
  v_product jsonb;
  v_theme_id uuid;
  v_product_id uuid;
  v_name text;
  v_theme_order integer := 0;
  v_product_order integer;
  v_seen_themes uuid[] := array[]::uuid[];
  v_seen_products uuid[];
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active and a.role <> 'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if coalesce(jsonb_typeof(p_themes), 'null') <> 'array' then
    raise exception 'basket_extra_themes_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('basket_extra_themes_v1', 0));
  delete from public.basket_extra_themes where true;

  for v_theme in select value from jsonb_array_elements(p_themes) loop
    v_name := btrim(coalesce(v_theme->>'name', ''));
    if v_name = '' or char_length(v_name) > 80 then raise exception 'basket_extra_theme_name_invalid'; end if;
    if coalesce(v_theme->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'basket_extra_theme_id_invalid';
    end if;
    v_theme_id := (v_theme->>'id')::uuid;
    if v_theme_id = any(v_seen_themes) then raise exception 'basket_extra_theme_id_invalid'; end if;
    v_seen_themes := array_append(v_seen_themes, v_theme_id);
    if coalesce(jsonb_typeof(v_theme->'products'), 'array') <> 'array' then raise exception 'basket_extra_theme_products_invalid'; end if;

    insert into public.basket_extra_themes(id, name, sort_order, updated_at)
    values (v_theme_id, v_name, v_theme_order, now());
    v_seen_products := array[]::uuid[];
    v_product_order := 0;
    for v_product in select value from jsonb_array_elements(coalesce(v_theme->'products','[]'::jsonb)) loop
      if coalesce(v_product->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'basket_extra_theme_product_invalid';
      end if;
      v_product_id := (v_product->>'product_id')::uuid;
      if v_product_id = any(v_seen_products) then raise exception 'basket_extra_theme_product_duplicate'; end if;
      if not exists (select 1 from public.products p where p.id = v_product_id) then
        raise exception 'basket_extra_theme_product_not_found';
      end if;
      v_seen_products := array_append(v_seen_products, v_product_id);
      insert into public.basket_extra_theme_products(theme_id, product_id, sort_order)
      values (v_theme_id, v_product_id, v_product_order);
      v_product_order := v_product_order + 1;
    end loop;
    v_theme_order := v_theme_order + 1;
  end loop;

  return public.admin_basket_extra_themes_editor_v1();
end;
$function$;

notify pgrst, 'reload schema';

commit;
