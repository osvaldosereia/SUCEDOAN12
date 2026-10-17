-- Dona Antônia · Cestas Molde · Rodada 6/6
-- Cutover gradual e não destrutivo: lotes físicos legados continuam vendáveis até zerarem.
-- Não desmonta lotes, não altera quantidade_available e não reserva estoque.

begin;

do $r6$
declare
  r record;
  v_canonical uuid;
  v_partner uuid;
  v_food uuid;
  v_food_kit uuid;
  v_partner_rice uuid;
  v_hidden numeric;
  v_current_product_total numeric;
  v_food_total numeric;
  v_positions jsonb;
begin
  -- ECONÔMICA: preserva o cadastro comercial atual e adiciona a segunda opção de arroz já comprovada no catálogo.
  select b.id into v_canonical
  from public.basket_templates b
  where b.name in ('Econômica','Economica Bonini')
  order by case when b.name='Econômica' then 0 else 1 end
  limit 1;

  select i.product_id into v_partner_rice
  from public.basket_templates b
  join public.basket_template_items i on i.basket_id=b.id
  where b.name='Mini Koblenz' and i.sort_order=1
  limit 1;

  if v_canonical is null or v_partner_rice is null then
    raise exception 'r6_economica_source_missing';
  end if;

  select coalesce(sum(i.quantity * (case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end)),0)
    into v_current_product_total
  from public.basket_template_items i
  join public.products p on p.id=i.product_id
  where i.basket_id=v_canonical;

  select round(b.base_price-v_current_product_total,2) into v_hidden
  from public.basket_templates b where b.id=v_canonical;

  select jsonb_agg(
    jsonb_build_object(
      'label',case when i.sort_order=1 then 'Arroz 5 kg' else p.name end,
      'quantity',i.quantity,
      'options',case when i.sort_order=1 and i.product_id<>v_partner_rice
        then jsonb_build_array(jsonb_build_object('product_id',i.product_id),jsonb_build_object('product_id',v_partner_rice))
        else jsonb_build_array(jsonb_build_object('product_id',i.product_id)) end
    ) order by i.sort_order,i.id
  ) into v_positions
  from public.basket_template_items i
  join public.products p on p.id=i.product_id
  where i.basket_id=v_canonical;

  update public.basket_templates
     set name='Econômica',
         rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('mold_canonical',true,'mold_target_slug','economica','mold_cutover_version',1),
         updated_at=now()
   where id=v_canonical;

  perform public.save_basket_mold_v1(v_canonical,v_hidden,2,v_positions,'R6 cutover');
  update public.basket_molds
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'cutover_version',1,'transition_mode','legacy_first','target_slug','economica',
       'legacy_source_basket_ids',jsonb_build_array(v_canonical),'mold_kind','standard'
     ),updated_at=now()
   where basket_id=v_canonical;

  -- MINI / PEQUENA / MÉDIA / GRANDE: Bonini vira a identidade canônica da cesta completa;
  -- Koblenz permanece como fonte física legada enquanto tiver lote pronto.
  for r in
    select * from (values
      ('Mini Bonini','Mini Koblenz','Mini Completa','Mini Só Alimento','MOLD-MINI-FOOD','mini-completa','mini-so-alimento'),
      ('Pequena Bonini','Pequena Koblenz','Pequena Completa','Pequena Só Alimento','MOLD-PEQUENA-FOOD','pequena-completa','pequena-so-alimento'),
      ('Média Bonini','Média Koblenz','Média Completa','Média Só Alimento','MOLD-MEDIA-FOOD','media-completa','media-so-alimento'),
      ('Grande Bonini','Grande Koblenz','Grande Completa','Grande Só Alimento','MOLD-GRANDE-FOOD','grande-completa','grande-so-alimento')
    ) as x(old_canonical,partner_name,complete_name,food_name,food_sku,complete_slug,food_slug)
  loop
    select b.id into v_canonical
    from public.basket_templates b
    where b.name in (r.old_canonical,r.complete_name)
    order by case when b.name=r.complete_name then 0 else 1 end
    limit 1;

    select b.id into v_partner from public.basket_templates b where b.name=r.partner_name limit 1;
    if v_canonical is null or v_partner is null then raise exception 'r6_complete_source_missing:%',r.complete_name; end if;

    select i.product_id into v_partner_rice
    from public.basket_template_items i
    where i.basket_id=v_partner and i.sort_order=1
    limit 1;
    if v_partner_rice is null then raise exception 'r6_partner_rice_missing:%',r.partner_name; end if;

    select coalesce(sum(i.quantity * (case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end)),0)
      into v_current_product_total
    from public.basket_template_items i
    join public.products p on p.id=i.product_id
    where i.basket_id=v_canonical;

    select round(b.base_price-v_current_product_total,2) into v_hidden
    from public.basket_templates b where b.id=v_canonical;

    select jsonb_agg(
      jsonb_build_object(
        'label',case when ci.sort_order=1 then 'Arroz 5 kg' else cp.name end,
        'quantity',ci.quantity,
        'options',(
          select jsonb_agg(jsonb_build_object('product_id',q.product_id) order by q.ord)
          from (
            select ci.product_id as product_id,0 as ord
            union all
            select pi.product_id,1
            from public.basket_template_items pi
            where pi.basket_id=v_partner
              and pi.sort_order=ci.sort_order
              and pi.quantity=ci.quantity
              and pi.product_id<>ci.product_id
          ) q
        )
      ) order by ci.sort_order,ci.id
    ) into v_positions
    from public.basket_template_items ci
    join public.products cp on cp.id=ci.product_id
    where ci.basket_id=v_canonical;

    update public.basket_templates
       set name=r.complete_name,
           rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('mold_canonical',true,'mold_kind','complete','mold_target_slug',r.complete_slug,'mold_cutover_version',1),
           updated_at=now()
     where id=v_canonical;

    update public.basket_templates
       set rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('mold_legacy_source',true,'mold_canonical_basket_id',v_canonical,'mold_cutover_version',1),
           updated_at=now()
     where id=v_partner;

    perform public.save_basket_mold_v1(v_canonical,v_hidden,2,v_positions,'R6 cutover');
    update public.basket_molds
       set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
         'cutover_version',1,'transition_mode','legacy_first','target_slug',r.complete_slug,
         'legacy_source_basket_ids',jsonb_build_array(v_canonical,v_partner),'mold_kind','complete'
       ),updated_at=now()
     where basket_id=v_canonical;

    -- Cesta Só Alimento deriva da receita alimentar canônica Bonini. Mantém o mesmo valor oculto fixo
    -- da cesta completa, removendo apenas o preço dos itens de limpeza/higiene.
    select k.id into v_food_kit
    from public.store_basket_recipe_kits rk
    join public.assembly_kits k on k.id=rk.kit_id
    where rk.basket_id=v_canonical and k.type='food' and k.is_active=true
    order by rk.sort_order,k.id
    limit 1;
    if v_food_kit is null then raise exception 'r6_food_kit_missing:%',r.complete_name; end if;

    select coalesce(sum(ai.quantity * (case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end)),0)
      into v_food_total
    from public.assembly_kit_items ai
    join public.products p on p.id=ai.product_id
    where ai.kit_id=v_food_kit;

    select b.id into v_food from public.basket_templates b where b.name=r.food_name limit 1;
    if v_food is null then
      insert into public.basket_templates(
        sku,name,description,image_url,base_price,is_active,sort_order,rules,is_whatsapp_active,is_featured,internal_notes,
        hidden_adjustment,uses_hygiene_kit,split_kits_enabled,category_id
      )
      select r.food_sku,r.food_name,'Versão somente alimentos gerada pelo modelo Cesta Molde.',c.image_url,
             round(v_food_total+v_hidden,2),true,c.sort_order,
             jsonb_build_object('mold_canonical',true,'mold_generated',true,'mold_kind','food_only','mold_target_slug',r.food_slug,'mold_source_complete_id',v_canonical,'mold_cutover_version',1),
             c.is_whatsapp_active,false,'Gerada automaticamente na Rodada 6 do Cesta Molde.',v_hidden,false,false,c.category_id
      from public.basket_templates c where c.id=v_canonical
      returning id into v_food;
    else
      update public.basket_templates
         set base_price=round(v_food_total+v_hidden,2),hidden_adjustment=v_hidden,is_active=true,
             rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('mold_canonical',true,'mold_generated',true,'mold_kind','food_only','mold_target_slug',r.food_slug,'mold_source_complete_id',v_canonical,'mold_cutover_version',1),
             updated_at=now()
       where id=v_food;
    end if;

    with ranked as (
      select ai.product_id,ai.quantity,ai.sort_order,p.name,
             row_number() over(order by ai.sort_order,ai.id) as rn
      from public.assembly_kit_items ai
      join public.products p on p.id=ai.product_id
      where ai.kit_id=v_food_kit
    )
    select jsonb_agg(
      jsonb_build_object(
        'label',case when rn=1 then 'Arroz 5 kg' else name end,
        'quantity',quantity,
        'options',case when rn=1 and product_id<>v_partner_rice
          then jsonb_build_array(jsonb_build_object('product_id',product_id),jsonb_build_object('product_id',v_partner_rice))
          else jsonb_build_array(jsonb_build_object('product_id',product_id)) end
      ) order by sort_order,rn
    ) into v_positions
    from ranked;

    perform public.save_basket_mold_v1(v_food,v_hidden,2,v_positions,'R6 cutover');
    update public.basket_molds
       set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
         'cutover_version',1,'transition_mode','mold_only','target_slug',r.food_slug,
         'legacy_source_basket_ids','[]'::jsonb,'mold_kind','food_only','derived_from_basket_id',v_canonical
       ),updated_at=now()
     where basket_id=v_food;
  end loop;

  -- O antigo Kit Limpeza permanece disponível tecnicamente para receitas/lotes históricos,
  -- mas não pertence à lista comercial diária de Cestas Molde.
  update public.basket_templates
     set rules=coalesce(rules,'{}'::jsonb)||jsonb_build_object('mold_internal_legacy',true,'mold_cutover_version',1),updated_at=now()
   where name='Kit Limpeza e Higiene';
end;
$r6$;

-- Admin diário: não mostrar fontes legadas Koblenz nem o container técnico de limpeza.
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
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active=true
  ) then raise exception 'admin_not_authorized'; end if;

  return jsonb_build_object('baskets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'image_url',b.image_url,'base_price',b.base_price,'is_active',b.is_active,
      'mold_configured',(m.id is not null),'hidden_adjustment',coalesce(m.hidden_adjustment,0),
      'public_composition_count',coalesce(m.public_composition_count,2)
    ) order by b.sort_order,b.name,b.id)
    from public.basket_templates b
    left join public.basket_molds m on m.basket_id=b.id
    where b.is_active=true
      and coalesce((b.rules->>'mold_legacy_source')::boolean,false)=false
      and coalesce((b.rules->>'mold_internal_legacy')::boolean,false)=false
  ),'[]'::jsonb));
end;
$function$;

revoke all on function public.admin_basket_mold_list_v1() from public,anon,authenticated;
grant execute on function public.admin_basket_mold_list_v1() to authenticated;

commit;
