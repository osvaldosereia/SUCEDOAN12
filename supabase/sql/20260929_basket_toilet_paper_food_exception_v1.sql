-- 2026-09-29 · Dona Antônia
-- Regra excepcional de composição:
-- Papel higiênico NÃO faz parte do kit universal Limpeza/Higiene.
-- Ele pertence ao kit de Alimentos das cestas Mini, Pequena, Média e Grande.
-- A cesta Econômica permanece sem papel higiênico.
-- Migration aplicada no Supabase como basket_toilet_paper_food_exception_v1.

do $$
declare
  v_product_id uuid;
begin
  select id into v_product_id
  from public.products
  where gtin='7898901374107'
    and lower(name) like '%papel higi%'
  limit 1;

  if v_product_id is null then
    raise exception 'toilet_paper_product_not_found';
  end if;

  delete from public.basket_kit_template_items i
  using public.basket_kit_templates k
  where i.kit_template_id=k.id
    and k.kind='hygiene'
    and i.product_id=v_product_id;

  insert into public.basket_kit_template_items(
    kit_template_id,product_id,source_template_item_id,quantity,
    removable,quantity_editable,min_quantity,max_quantity,
    remove_unit_delta,add_unit_delta,sort_order,metadata
  )
  select
    k.id,bi.product_id,bi.id,bi.quantity,
    bi.removable,bi.quantity_editable,bi.min_quantity,bi.max_quantity,
    bi.remove_unit_delta,bi.add_unit_delta,bi.sort_order,
    jsonb_build_object(
      'source','commercial_basket_food',
      'business_exception','toilet_paper_in_food_kit',
      'rule_date','2026-09-29'
    )
  from public.basket_kit_templates k
  join public.basket_templates bt on bt.id=k.basket_id
  join public.basket_template_items bi on bi.basket_id=bt.id
  where k.kind='food'
    and k.is_active=true
    and bt.is_active=true
    and bt.name not ilike 'Economica%'
    and bi.product_id=v_product_id
    and not exists(
      select 1
      from public.basket_kit_template_items x
      where x.kit_template_id=k.id
        and x.product_id=bi.product_id
    );

  delete from public.basket_kit_template_items i
  using public.basket_kit_templates k, public.basket_templates bt
  where i.kit_template_id=k.id
    and k.kind='food'
    and k.basket_id=bt.id
    and bt.name ilike 'Economica%'
    and i.product_id=v_product_id;
end $$;
