begin;

alter table public.papoai_commerce_pending_actions
  drop constraint if exists papoai_commerce_pending_actions_action_type_check;

alter table public.papoai_commerce_pending_actions
  add constraint papoai_commerce_pending_actions_action_type_check
  check(action_type in (
    'replace_basket_item',
    'confirm_order',
    'repeat_last_purchase',
    'product_choice',
    'value_replacement'
  ));

create or replace function public.papoai_commerce_product_family_v1(p_category text)
returns text
language sql
immutable
as $$
  select case
    when upper(coalesce(p_category,'')) in (
      'MERCEARIA BÁSICA','MACARRÃO E MOLHOS','MOLHOS E CONDIMENTOS',
      'CAFÉ DA MANHÃ','BOLACHAS E BISCOITOS','CHOCOLATES E DOCES',
      'CONFEITARIA','SALGADINHOS E PETISCOS','SUCOS, REFRI E ENERGÉTICOS',
      'TEMPEROS','BALAS E CHICLETES'
    ) then 'food'
    when upper(coalesce(p_category,'')) in ('LIMPEZA','LAVANDERIA') then 'cleaning'
    when upper(coalesce(p_category,'')) in (
      'HIGIENE','SABONETE','SHAMPOO E CONDICIONADOR','BELEZA'
    ) then 'personal_care'
    when upper(coalesce(p_category,''))='BEBÊ' then 'baby'
    when upper(coalesce(p_category,''))='PETS' then 'pet'
    else 'other'
  end;
$$;

create or replace function public.recommend_papoai_commerce_value_replacement_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_match jsonb;
  v_cart public.carts%rowtype;
  v_source_item public.cart_items%rowtype;
  v_template public.basket_template_items%rowtype;
  v_source_product public.products%rowtype;
  v_source_id uuid;
  v_source_family text;
  v_remove_unit_delta numeric;
  v_target_delta numeric;
  v_budget numeric;
  v_options jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,3),5));
begin
  v_match:=public.resolve_papoai_commerce_cart_item_v1(p_conversation_id,p_source_query);
  if not coalesce((v_match->>'found')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason',coalesce(v_match->>'reason','source_not_found'),
      'source_candidates',coalesce(v_match->'candidates','[]'::jsonb),
      'options','[]'::jsonb
    );
  end if;

  v_source_id:=(v_match->>'product_id')::uuid;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'reason','cart_not_found','options','[]'::jsonb);
  end if;

  select * into v_source_item
  from public.cart_items
  where cart_id=v_cart.id
    and product_id=v_source_id
    and source='basket'
    and quantity>0
  order by created_at
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'reason','value_replacement_requires_basket_item',
      'options','[]'::jsonb
    );
  end if;

  select * into v_template
  from public.basket_template_items
  where id=nullif(v_source_item.metadata->>'basket_template_item_id','')::uuid;

  if not found then
    return jsonb_build_object('ok',false,'reason','basket_template_item_not_found','options','[]'::jsonb);
  end if;

  if not coalesce(v_template.removable,false) then
    return jsonb_build_object('ok',false,'reason','item_not_removable','options','[]'::jsonb);
  end if;

  select * into v_source_product
  from public.products
  where id=v_source_id;

  if not found then
    return jsonb_build_object('ok',false,'reason','source_product_missing','options','[]'::jsonb);
  end if;

  v_remove_unit_delta:=case
    when v_template.remove_unit_delta is null then -coalesce(v_source_item.unit_price,0)
    when v_template.remove_unit_delta>0 then -v_template.remove_unit_delta
    else v_template.remove_unit_delta
  end;

  if v_remove_unit_delta>=0 then
    return jsonb_build_object('ok',false,'reason','remove_pricing_not_configured','options','[]'::jsonb);
  end if;

  v_target_delta:=abs(0-v_template.quantity)*v_remove_unit_delta;
  v_budget:=round(greatest(0,coalesce(v_source_item.commercial_delta,0)-v_target_delta),2);

  if v_budget<=0 then
    return jsonb_build_object('ok',false,'reason','replacement_budget_not_positive','options','[]'::jsonb);
  end if;

  v_source_family:=public.papoai_commerce_product_family_v1(v_source_product.category);

  with current_items as (
    select ci.product_id,ci.source,ci.quantity,ci.unit_price,ci.commercial_unit_price,
           nullif(ci.metadata->>'basket_template_item_id','')::uuid template_item_id
    from public.cart_items ci
    where ci.cart_id=v_cart.id and ci.quantity>0
  ),
  basket_candidates as (
    select
      p.id product_id,
      p.name,
      p.brand,
      p.category,
      p.subcategory,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      'increase_basket'::text apply_mode,
      ci.quantity current_quantity,
      ci.quantity+1 target_quantity,
      1::numeric quantity_increment,
      coalesce(bi.add_unit_delta,ci.unit_price)::numeric unit_value,
      greatest(
        0,
        least(
          coalesce(bi.max_quantity,greatest(bi.quantity,20))-ci.quantity,
          coalesce(p.stock,0)-ci.quantity
        )
      )::numeric capacity
    from current_items ci
    join public.products p on p.id=ci.product_id
    join public.basket_template_items bi on bi.id=ci.template_item_id
    where ci.source='basket'
      and ci.product_id<>v_source_id
      and coalesce(bi.quantity_editable,false)=true
      and coalesce(bi.add_unit_delta,ci.unit_price,0)>0
      and public.papoai_commerce_product_family_v1(p.category)=v_source_family
      and coalesce(p.subcategory,'') is distinct from coalesce(v_source_product.subcategory,'')
  ),
  addon_candidates as (
    select
      p.id product_id,
      p.name,
      p.brand,
      p.category,
      p.subcategory,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      'addon'::text apply_mode,
      coalesce(existing.quantity,0)::numeric current_quantity,
      coalesce(existing.quantity,0)+1 target_quantity,
      1::numeric quantity_increment,
      case
        when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price then p.offer_price
        else p.price
      end::numeric unit_value,
      greatest(0,coalesce(p.stock,0)-coalesce(existing.quantity,0))::numeric capacity
    from public.products p
    left join current_items existing
      on existing.product_id=p.id and existing.source='addon'
    where p.id<>v_source_id
      and p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>coalesce(existing.quantity,0)
      and coalesce(p.price,0)>0
      and public.papoai_commerce_product_family_v1(p.category)=v_source_family
      and coalesce(p.subcategory,'') is distinct from coalesce(v_source_product.subcategory,'')
      and not exists(
        select 1
        from current_items ci2
        where ci2.product_id=p.id and ci2.source in ('basket','substitution')
      )
  ),
  raw_candidates as (
    select * from basket_candidates
    union all
    select * from addon_candidates
  ),
  candidate_pool as (
    select *
    from raw_candidates
    where capacity>=1
      and unit_value>0
      and unit_value<=v_budget*1.35
    order by least(abs(unit_value-v_budget),abs(unit_value-(v_budget/2))),name
    limit 32
  ),
  single_options as (
    select
      jsonb_build_array(jsonb_build_object(
        'product_id',product_id,
        'name',name,
        'brand',brand,
        'category',category,
        'subcategory',subcategory,
        'image_url',image_url,
        'apply_mode',apply_mode,
        'quantity_increment',1,
        'target_quantity',target_quantity,
        'commercial_value',round(unit_value,2)
      )) items,
      unit_value total_value,
      1 item_count,
      case when unit_value<=v_budget then 0 else 1 end over_budget
    from candidate_pool
  ),
  pair_distinct_options as (
    select
      jsonb_build_array(
        jsonb_build_object(
          'product_id',a.product_id,'name',a.name,'brand',a.brand,
          'category',a.category,'subcategory',a.subcategory,'image_url',a.image_url,
          'apply_mode',a.apply_mode,'quantity_increment',1,
          'target_quantity',a.target_quantity,'commercial_value',round(a.unit_value,2)
        ),
        jsonb_build_object(
          'product_id',b.product_id,'name',b.name,'brand',b.brand,
          'category',b.category,'subcategory',b.subcategory,'image_url',b.image_url,
          'apply_mode',b.apply_mode,'quantity_increment',1,
          'target_quantity',b.target_quantity,'commercial_value',round(b.unit_value,2)
        )
      ) items,
      a.unit_value+b.unit_value total_value,
      2 item_count,
      case when a.unit_value+b.unit_value<=v_budget then 0 else 1 end over_budget
    from candidate_pool a
    join candidate_pool b on a.product_id::text<b.product_id::text
    where a.unit_value+b.unit_value<=v_budget*1.20
  ),
  pair_same_options as (
    select
      jsonb_build_array(jsonb_build_object(
        'product_id',product_id,
        'name',name,
        'brand',brand,
        'category',category,
        'subcategory',subcategory,
        'image_url',image_url,
        'apply_mode',apply_mode,
        'quantity_increment',2,
        'target_quantity',current_quantity+2,
        'commercial_value',round(unit_value*2,2)
      )) items,
      unit_value*2 total_value,
      1 item_count,
      case when unit_value*2<=v_budget then 0 else 1 end over_budget
    from candidate_pool
    where capacity>=2
      and unit_value*2<=v_budget*1.20
  ),
  all_options as (
    select * from single_options
    union all
    select * from pair_distinct_options
    union all
    select * from pair_same_options
  ),
  ranked_options as (
    select
      items,
      total_value,
      item_count,
      over_budget,
      abs(total_value-v_budget) difference,
      row_number() over(
        order by
          case when abs(total_value-v_budget)<=greatest(1,v_budget*.08) then 0 else 1 end,
          abs(total_value-v_budget),
          over_budget,
          item_count,
          total_value desc
      ) rn
    from all_options
    where total_value>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'option',rn,
    'items',items,
    'total_value',round(total_value,2),
    'difference',round(total_value-v_budget,2),
    'absolute_difference',round(difference,2),
    'difference_percent',round((difference/nullif(v_budget,0))*100,1),
    'close_value',difference<=greatest(1,v_budget*.10)
  ) order by rn),'[]'::jsonb)
  into v_options
  from ranked_options
  where rn<=v_limit;

  return jsonb_build_object(
    'ok',true,
    'source',jsonb_build_object(
      'product_id',v_source_product.id,
      'name',v_source_product.name,
      'category',v_source_product.category,
      'subcategory',v_source_product.subcategory,
      'current_quantity',v_source_item.quantity,
      'target_quantity',0
    ),
    'replacement_budget',v_budget,
    'family',v_source_family,
    'options',coalesce(v_options,'[]'::jsonb),
    'count',jsonb_array_length(coalesce(v_options,'[]'::jsonb)),
    'calculation_authority','supabase',
    'writes_performed',false
  );
end;
$$;

create or replace function public.propose_papoai_commerce_value_replacement_v1(
  p_conversation_id uuid,
  p_source_query text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_recommendation jsonb;
  v_cart_id uuid;
  v_action_id uuid;
  v_fingerprint text;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  v_recommendation:=public.recommend_papoai_commerce_value_replacement_v1(
    p_conversation_id,p_source_query,3
  );

  if not coalesce((v_recommendation->>'ok')::boolean,false)
     or coalesce((v_recommendation->>'count')::integer,0)=0
  then
    return v_recommendation;
  end if;

  select id into v_cart_id
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc
  limit 1;

  v_fingerprint:=public.papoai_commerce_cart_fingerprint_v1(v_cart_id);

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,
    'value_replacement',
    'pending',
    jsonb_build_object(
      'source',v_recommendation->'source',
      'replacement_budget',v_recommendation->'replacement_budget',
      'family',v_recommendation->'family',
      'options',v_recommendation->'options',
      'cart_id',v_cart_id,
      'cart_fingerprint',v_fingerprint,
      'source_query',p_source_query
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  return v_recommendation||jsonb_build_object(
    'pending_action_id',v_action_id,
    'action_type','value_replacement',
    'requires_selection',true,
    'expires_in_seconds',900
  );
end;
$$;

create or replace function public.select_papoai_commerce_value_replacement_v1(
  p_conversation_id uuid,
  p_selection integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_cart_id uuid;
  v_fingerprint text;
  v_options jsonb;
  v_option jsonb;
  v_items jsonb;
  v_item jsonb;
  v_source_id uuid;
  v_source_target numeric;
  v_cart jsonb;
  v_summary jsonb;
  v_count integer;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and action_type='value_replacement'
    and status='pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','no_pending_value_replacement');
  end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','value_replacement_expired');
  end if;

  v_cart_id:=(v_action.payload->>'cart_id')::uuid;
  v_fingerprint:=public.papoai_commerce_cart_fingerprint_v1(v_cart_id);

  if v_fingerprint is distinct from v_action.payload->>'cart_fingerprint' then
    update public.papoai_commerce_pending_actions
       set status='failed',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','cart_changed_recommend_again');
  end if;

  v_options:=coalesce(v_action.payload->'options','[]'::jsonb);
  v_count:=jsonb_array_length(v_options);

  if p_selection is null or p_selection<1 or p_selection>v_count then
    return jsonb_build_object(
      'ok',false,'reason','selection_out_of_range','candidate_count',v_count
    );
  end if;

  v_option:=v_options->(p_selection-1);
  v_items:=coalesce(v_option->'items','[]'::jsonb);
  v_source_id:=(v_action.payload#>>'{source,product_id}')::uuid;
  v_source_target:=coalesce((v_action.payload#>>'{source,target_quantity}')::numeric,0);

  perform public.set_papoai_commerce_basket_quantity_v1(
    p_conversation_id,v_source_id,v_source_target
  );

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    if v_item->>'apply_mode'='increase_basket' then
      perform public.set_papoai_commerce_basket_quantity_v1(
        p_conversation_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'target_quantity')::numeric
      );
    elsif v_item->>'apply_mode'='addon' then
      perform public.set_papoai_commerce_addon_quantity_v1(
        p_conversation_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'target_quantity')::numeric
      );
    else
      raise exception 'unsupported_value_replacement_apply_mode';
    end if;
  end loop;

  v_cart:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  v_summary:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);

  update public.papoai_commerce_pending_actions
     set status='confirmed',
         resolved_at=now(),
         updated_at=now(),
         payload=payload||jsonb_build_object(
           'selected_option',p_selection,
           'applied_at',now()
         )
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'action_type','value_replacement',
    'selected_option',p_selection,
    'source',v_action.payload->'source',
    'replacement_budget',v_action.payload->'replacement_budget',
    'replacement',v_option,
    'cart',v_cart,
    'summary',v_summary
  );
end;
$$;

revoke all on function public.papoai_commerce_product_family_v1(text) from public,anon,authenticated;
grant execute on function public.papoai_commerce_product_family_v1(text) to service_role;

revoke all on function public.recommend_papoai_commerce_value_replacement_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.recommend_papoai_commerce_value_replacement_v1(uuid,text,integer) to service_role;

revoke all on function public.propose_papoai_commerce_value_replacement_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_value_replacement_v1(uuid,text) to service_role;

revoke all on function public.select_papoai_commerce_value_replacement_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.select_papoai_commerce_value_replacement_v1(uuid,integer) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'delegated_replacement_policy','recommend_near_value_same_family_then_customer_selects',
  'delegated_replacement_max_options',3,
  'delegated_replacement_calculation_authority','supabase'
),
updated_at=now()
where id=1;

commit;
