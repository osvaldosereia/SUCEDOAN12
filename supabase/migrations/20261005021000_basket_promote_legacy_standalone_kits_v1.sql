begin;

-- Dona Antônia · promoção de kits comerciais standalone legados v1
-- basket_templates permanece a única entidade comercial pública.
do $$
declare
  r record;
  v_basket_id uuid;
  v_price numeric(14,2);
  v_sort integer;
begin
  for r in
    select k.id,k.name,k.category_id,k.is_active,k.sort_order
    from public.basket_kit_templates k
    where k.basket_id is null
      and k.category_id is not null
      and k.is_active=true
    order by k.sort_order,k.created_at,k.id
  loop
    select coalesce((
      select l.sale_price_override
      from public.basket_stock_lots l
      where l.kit_template_id=r.id
        and l.status in ('ready','draft')
        and coalesce(l.sale_price_override,0)>0
      order by case when l.status='ready' then 0 else 1 end,
               l.built_at nulls last,l.created_at,l.id
      limit 1
    ),0)::numeric(14,2)
    into v_price;

    select coalesce(max(bt.sort_order),0)+10
    into v_sort
    from public.basket_templates bt;

    insert into public.basket_templates(
      name,base_price,is_active,is_whatsapp_active,is_featured,
      uses_hygiene_kit,split_kits_enabled,category_id,sort_order,internal_notes
    ) values (
      r.name,v_price,r.is_active,false,false,
      false,true,r.category_id,v_sort,
      'Promovido do kit comercial legado em 2026-10-05; composição preservada no basket_kit_template existente.'
    )
    returning id into v_basket_id;

    update public.basket_kit_templates
    set basket_id=v_basket_id,
        category_id=null,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'promoted_to_commercial_basket_id',v_basket_id,
          'promoted_at',now(),
          'promotion','basket_promote_legacy_standalone_kits_v1'
        )
    where id=r.id;

    update public.basket_stock_lots
    set basket_id=v_basket_id,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'commercial_model_promoted_at',now(),
          'commercial_model_promotion','basket_promote_legacy_standalone_kits_v1'
        )
    where kit_template_id=r.id;
  end loop;
end$$;

commit;
