-- Dona Antônia · edição segura de componentes da receita comercial v1
-- Altera somente a receita para montagens futuras. Lotes físicos existentes permanecem snapshots imutáveis.
begin;

create or replace function public.edit_store_basket_component_v1(
  p_basket_id uuid,
  p_kit_id uuid,
  p_product_id uuid,
  p_action text,
  p_new_product_id uuid default null,
  p_quantity numeric default null,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_link_id uuid;
  v_target_kit_id uuid:=p_kit_id;
  v_usage_count integer:=0;
  v_active_usage_count integer:=0;
  v_item_count integer:=0;
  v_old_quantity numeric;
  v_existing_quantity numeric;
  v_kit public.assembly_kits%rowtype;
  v_basket_name text;
  v_cloned boolean:=false;
  v_hidden_adjustment numeric:=0;
begin
  if p_basket_id is null then raise exception 'store_basket_required'; end if;
  if p_kit_id is null then raise exception 'store_basket_kit_required'; end if;
  if p_product_id is null then raise exception 'store_basket_component_required'; end if;
  if v_action not in ('set_quantity','replace','remove') then raise exception 'store_basket_component_action_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_basket_id::text,0));

  select b.name into v_basket_name
  from public.basket_templates b
  where b.id=p_basket_id and b.is_active=true
  for update;
  if not found then raise exception 'store_basket_not_found'; end if;

  select r.id into v_link_id
  from public.store_basket_recipe_kits r
  where r.basket_id=p_basket_id and r.kit_id=p_kit_id
  for update;
  if v_link_id is null then raise exception 'store_basket_kit_not_linked'; end if;

  select * into v_kit
  from public.assembly_kits k
  where k.id=p_kit_id and k.is_active=true
  for update;
  if not found then raise exception 'store_basket_kit_unavailable'; end if;

  select i.quantity into v_old_quantity
  from public.assembly_kit_items i
  where i.kit_id=p_kit_id and i.product_id=p_product_id
  for update;
  if v_old_quantity is null then raise exception 'store_basket_component_not_found'; end if;

  if v_action='set_quantity' and (p_quantity is null or p_quantity<=0 or p_quantity>999) then
    raise exception 'store_basket_component_quantity_invalid';
  end if;

  if v_action='replace' then
    if p_new_product_id is null then raise exception 'store_basket_replacement_required'; end if;
    if p_new_product_id=p_product_id then
      return jsonb_build_object(
        'ok',true,'changed',false,'cloned',false,'basket_id',p_basket_id,
        'source_kit_id',p_kit_id,'target_kit_id',p_kit_id,'action',v_action
      );
    end if;
    if not exists(select 1 from public.products p where p.id=p_new_product_id and p.is_active=true) then
      raise exception 'store_basket_replacement_unavailable';
    end if;
  end if;

  if v_action='remove' then
    select count(*)::integer into v_item_count
    from public.assembly_kit_items i where i.kit_id=p_kit_id;
    if v_item_count<=1 then raise exception 'store_basket_component_last_item'; end if;
  end if;

  -- Um kit pode estar ligado também a modelos temporariamente inativos.
  -- Para impedir efeitos laterais futuros, qualquer segundo vínculo força clone exclusivo.
  select
    count(distinct r.basket_id)::integer,
    count(distinct r.basket_id) filter(where b.is_active=true)::integer
  into v_usage_count,v_active_usage_count
  from public.store_basket_recipe_kits r
  left join public.basket_templates b on b.id=r.basket_id
  where r.kit_id=p_kit_id;

  -- Edição pela tela de uma cesta é sempre basket-only. Se a receita é compartilhada,
  -- cria uma cópia exclusiva e religa somente a cesta atual antes de alterar itens.
  if v_usage_count>1 then
    insert into public.assembly_kits(name,type,notes,source_kit_id,is_active,metadata)
    values(
      left(v_kit.name||' · '||v_basket_name,180),
      v_kit.type,
      v_kit.notes,
      p_kit_id,
      true,
      coalesce(v_kit.metadata,'{}'::jsonb)||jsonb_build_object(
        'exclusive_for_basket_id',p_basket_id,
        'cloned_for_recipe_edit',true,
        'cloned_by',v_operator,
        'cloned_at',now()
      )
    ) returning id into v_target_kit_id;

    insert into public.assembly_kit_items(kit_id,product_id,quantity,sort_order)
    select v_target_kit_id,i.product_id,i.quantity,i.sort_order
    from public.assembly_kit_items i
    where i.kit_id=p_kit_id
    order by i.sort_order,i.id;

    update public.store_basket_recipe_kits
    set kit_id=v_target_kit_id,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'exclusive_clone_from',p_kit_id,
          'recipe_edit_operator',v_operator,
          'recipe_edit_at',now()
        ),
        updated_at=now()
    where id=v_link_id;

    v_cloned:=true;
  end if;

  if v_action='set_quantity' then
    update public.assembly_kit_items
    set quantity=p_quantity,updated_at=now()
    where kit_id=v_target_kit_id and product_id=p_product_id;

  elsif v_action='replace' then
    select i.quantity into v_existing_quantity
    from public.assembly_kit_items i
    where i.kit_id=v_target_kit_id and i.product_id=p_new_product_id
    for update;

    if v_existing_quantity is not null then
      update public.assembly_kit_items
      set quantity=quantity+v_old_quantity,updated_at=now()
      where kit_id=v_target_kit_id and product_id=p_new_product_id;

      delete from public.assembly_kit_items
      where kit_id=v_target_kit_id and product_id=p_product_id;
    else
      update public.assembly_kit_items
      set product_id=p_new_product_id,updated_at=now()
      where kit_id=v_target_kit_id and product_id=p_product_id;
    end if;

  elsif v_action='remove' then
    delete from public.assembly_kit_items
    where kit_id=v_target_kit_id and product_id=p_product_id;
  end if;

  update public.assembly_kits
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'recipe_edited_by',v_operator,
        'recipe_edited_at',now(),
        'recipe_edit_action',v_action
      ),
      updated_at=now()
  where id=v_target_kit_id;

  -- Mantém o snapshot comercial persistido coerente com a receita neste momento.
  select b.base_price-coalesce(sum(coalesce(p.price,0)*i.quantity*r.quantity),0)
  into v_hidden_adjustment
  from public.basket_templates b
  left join public.store_basket_recipe_kits r on r.basket_id=b.id
  left join public.assembly_kit_items i on i.kit_id=r.kit_id
  left join public.products p on p.id=i.product_id
  where b.id=p_basket_id
  group by b.base_price;

  update public.basket_templates
  set hidden_adjustment=coalesce(v_hidden_adjustment,base_price),
      updated_at=now()
  where id=p_basket_id;

  return jsonb_build_object(
    'ok',true,
    'changed',true,
    'basket_id',p_basket_id,
    'source_kit_id',p_kit_id,
    'target_kit_id',v_target_kit_id,
    'cloned',v_cloned,
    'shared_usage_before',v_usage_count,
    'active_usage_before',v_active_usage_count,
    'action',v_action,
    'product_id',p_product_id,
    'new_product_id',p_new_product_id,
    'quantity',case when v_action='set_quantity' then p_quantity else null end,
    'hidden_adjustment',v_hidden_adjustment
  );
end;
$function$;

revoke all on function public.edit_store_basket_component_v1(uuid,uuid,uuid,text,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.edit_store_basket_component_v1(uuid,uuid,uuid,text,uuid,numeric,text) to service_role;

commit;
