-- Dona Antônia · simplificação dos modelos de cestas
-- Mantém somente os modelos completos + Econômica ativos para novas vendas.
-- Preserva os moldes "Só Alimento" e suas posições como histórico, sem exclusão física.

do $$
declare
  v_complete_category_id uuid;
  v_food_category_id uuid;
  v_economic_subcategory_id uuid;
  v_economic_basket_id uuid;
begin
  select id
    into v_complete_category_id
  from public.basket_categories
  where slug = 'cestas-completas'
  limit 1;

  select id
    into v_food_category_id
  from public.basket_categories
  where slug in ('cestas-so-alimentos','cestas-so-alimento')
  order by case when slug = 'cestas-so-alimentos' then 0 else 1 end
  limit 1;

  if v_complete_category_id is null then
    raise exception 'basket_complete_category_not_found';
  end if;

  if v_food_category_id is null then
    raise exception 'basket_food_category_not_found';
  end if;

  select id
    into v_economic_subcategory_id
  from public.basket_subcategories
  where category_id = v_complete_category_id
    and lower(name) = lower('Econômica')
  order by created_at nulls last, id
  limit 1;

  if v_economic_subcategory_id is null then
    insert into public.basket_subcategories (
      category_id,
      name,
      sort_order,
      is_active
    )
    values (
      v_complete_category_id,
      'Econômica',
      50,
      true
    )
    returning id into v_economic_subcategory_id;
  else
    update public.basket_subcategories
       set name = 'Econômica',
           sort_order = 50,
           is_active = true
     where id = v_economic_subcategory_id;
  end if;

  select bm.basket_id
    into v_economic_basket_id
  from public.basket_molds bm
  where bm.metadata->>'target_slug' = 'economica'
  order by bm.created_at, bm.id
  limit 1;

  if v_economic_basket_id is null then
    raise exception 'economic_basket_mold_not_found';
  end if;

  update public.basket_templates
     set category_id = v_complete_category_id,
         subcategory_id = v_economic_subcategory_id,
         is_active = true,
         is_whatsapp_active = true,
         updated_at = now()
   where id = v_economic_basket_id;

  update public.basket_templates bt
     set is_active = false,
         is_whatsapp_active = false,
         updated_at = now()
   where bt.id in (
     select bm.basket_id
     from public.basket_molds bm
     where bm.metadata->>'mold_kind' = 'food_only'
   );

  update public.basket_molds
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'retired', true,
                         'retired_reason', 'catalog_simplification_complete_plus_economic',
                         'retired_at', '2026-10-07'
                       ),
         updated_at = now()
   where metadata->>'mold_kind' = 'food_only';

  update public.basket_subcategories
     set is_active = false
   where category_id = v_food_category_id;

  update public.basket_categories
     set is_active = false
   where id = v_food_category_id;

  update public.basket_categories
     set is_active = true,
         sort_order = 10
   where id = v_complete_category_id;
end
$$;
