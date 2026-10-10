-- Dona Antônia · Cestas Molde Admin v1
-- Rodada 2/6: wrappers administrativos autenticados para o editor simplificado.

begin;

create or replace function public.admin_basket_mold_list_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active = true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  return jsonb_build_object(
    'baskets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'image_url', b.image_url,
          'base_price', b.base_price,
          'is_active', b.is_active,
          'mold_configured', (m.id is not null),
          'hidden_adjustment', coalesce(m.hidden_adjustment, 0),
          'public_composition_count', coalesce(m.public_composition_count, 2)
        ) order by b.sort_order, b.name, b.id
      )
      from public.basket_templates b
      left join public.basket_molds m on m.basket_id = b.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active = true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  v_result := public.basket_mold_editor_v1(p_basket_id);
  if v_result is null then
    raise exception 'basket_mold_basket_not_found';
  end if;
  return v_result;
end;
$function$;

create or replace function public.admin_basket_mold_products_v1(
  p_query text default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(40, greatest(1, coalesce(p_limit, 24)));
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active = true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(row_data order by row_data->>'name', row_data->>'id')
      from (
        select jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'sku', p.sku,
          'gtin', p.gtin,
          'packaging', p.packaging,
          'image_url', p.image_url,
          'price', p.price,
          'cost', p.cost,
          'is_active', p.is_active,
          'loose_sellable_stock', coalesce(s.loose_sellable_stock, 0),
          'effective_sellable_stock', coalesce(s.effective_sellable_stock, 0),
          'basket_locked_quantity', coalesce(s.basket_locked_quantity, 0)
        ) as row_data
        from public.products p
        left join public.ops2_loose_sellable_stock_v1 s on s.product_id = p.id
        where p.is_active = true
          and (
            v_query = ''
            or p.name ilike '%' || v_query || '%'
            or coalesce(p.sku, '') ilike '%' || v_query || '%'
            or coalesce(p.gtin, '') ilike '%' || v_query || '%'
          )
        order by p.name, p.id
        limit v_limit
      ) q
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_save_basket_mold_v1(
  p_basket_id uuid,
  p_name text,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_operator text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_result jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid and a.is_active = true and a.role <> 'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  if v_name = '' or char_length(v_name) > 180 then
    raise exception 'basket_mold_name_invalid';
  end if;

  if p_basket_id is null or not exists (
    select 1 from public.basket_templates b where b.id = p_basket_id
  ) then
    raise exception 'basket_mold_basket_not_found';
  end if;

  update public.basket_templates
     set name = v_name,
         updated_at = now()
   where id = p_basket_id;

  v_result := public.save_basket_mold_v1(
    p_basket_id,
    p_hidden_adjustment,
    p_public_composition_count,
    p_positions,
    coalesce(nullif(btrim(p_operator), ''), 'Operação')
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('basket_name', v_name);
end;
$function$;

revoke all on function public.admin_basket_mold_list_v1() from public, anon, authenticated;
grant execute on function public.admin_basket_mold_list_v1() to authenticated;

revoke all on function public.admin_basket_mold_editor_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_basket_mold_editor_v1(uuid) to authenticated;

revoke all on function public.admin_basket_mold_products_v1(text, integer) from public, anon, authenticated;
grant execute on function public.admin_basket_mold_products_v1(text, integer) to authenticated;

revoke all on function public.admin_save_basket_mold_v1(uuid, text, numeric, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_save_basket_mold_v1(uuid, text, numeric, integer, jsonb, text) to authenticated;

commit;
