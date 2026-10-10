-- Dona Antônia · bootstrap de receitas legadas no novo Criador de Kits v1
-- Migração somente de receita/configuração. Não cria lote físico e não reserva estoque.
begin;

insert into public.assembly_kits(
  id,
  name,
  type,
  notes,
  source_kit_id,
  is_active,
  metadata,
  created_at,
  updated_at
)
select
  k.id,
  k.name,
  case
    when k.kind = 'food' then 'food'
    when k.kind in ('hygiene','cleaning') then 'cleaning_hygiene'
    else 'other'
  end,
  null,
  null,
  true,
  jsonb_build_object(
    'legacy_basket_kit_template_id',k.id,
    'legacy_kind',k.kind,
    'legacy_code_prefix',k.code_prefix,
    'migrated_via','assembly_kits_legacy_bootstrap_v1'
  ),
  coalesce(k.created_at,now()),
  now()
from public.basket_kit_templates k
where k.is_active = true
  and exists(
    select 1
    from public.basket_kit_template_items legacy_item
    where legacy_item.kit_template_id=k.id
      and legacy_item.quantity>0
  )
on conflict (id) do nothing;

insert into public.assembly_kit_items(
  id,
  kit_id,
  product_id,
  quantity,
  sort_order,
  created_at,
  updated_at
)
select
  i.id,
  i.kit_template_id,
  i.product_id,
  i.quantity,
  i.sort_order,
  coalesce(i.created_at,now()),
  now()
from public.basket_kit_template_items i
join public.basket_kit_templates legacy
  on legacy.id=i.kit_template_id
join public.assembly_kits imported
  on imported.id=i.kit_template_id
where legacy.is_active=true
  and i.quantity>0
on conflict (id) do nothing;

insert into public.store_basket_recipe_kits(
  basket_id,
  kit_id,
  quantity,
  is_required,
  sort_order,
  metadata
)
select
  legacy.basket_id,
  legacy.id,
  1,
  true,
  0,
  jsonb_build_object(
    'legacy_basket_kit_template_id',legacy.id,
    'linked_via','assembly_kits_legacy_bootstrap_v1'
  )
from public.basket_kit_templates legacy
join public.assembly_kits imported
  on imported.id=legacy.id
where legacy.is_active=true
  and legacy.basket_id is not null
  and exists(
    select 1
    from public.assembly_kit_items imported_item
    where imported_item.kit_id=imported.id
  )
on conflict (basket_id,kit_id) do nothing;

commit;
