begin;

create or replace function public.propose_papoai_commerce_product_choice_v1(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_search jsonb;
  v_items jsonb;
  v_action_id uuid;
  v_limit integer:=greatest(1,least(coalesce(p_limit,3),10));
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then
    raise exception 'papoai_commerce_brain_disabled';
  end if;

  v_search:=public.search_papoai_commerce_products_v1(p_query,v_limit);
  v_items:=coalesce(v_search->'items','[]'::jsonb);

  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object(
      'ok',false,
      'reason','product_not_found',
      'query',p_query,
      'candidates','[]'::jsonb,
      'writes_performed',false
    );
  end if;

  if coalesce(v_cfg.write_enabled,false) then
    update public.papoai_commerce_pending_actions
       set status='cancelled',resolved_at=now(),updated_at=now()
     where conversation_id=p_conversation_id
       and status='pending'
       and action_type='product_choice';

    insert into public.papoai_commerce_pending_actions(
      conversation_id,action_type,status,payload,expires_at
    ) values(
      p_conversation_id,
      'product_choice',
      'pending',
      jsonb_build_object(
        'query',p_query,
        'candidates',v_items
      ),
      now()+interval '10 minutes'
    )
    returning id into v_action_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'candidates',v_items,
    'count',jsonb_array_length(v_items),
    'pending_action_id',v_action_id,
    'selection_required',jsonb_array_length(v_items)>1,
    'single_candidate',jsonb_array_length(v_items)=1,
    'writes_performed',false
  );
end;
$$;

create or replace function public.select_papoai_commerce_product_choice_v1(
  p_conversation_id uuid,
  p_selection integer,
  p_quantity numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_count integer;
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  if p_selection is null or p_selection<1 or p_selection>10 then
    return jsonb_build_object('ok',false,'reason','invalid_selection');
  end if;

  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and action_type='product_choice'
    and status='pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','no_pending_product_choice');
  end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','product_choice_expired');
  end if;

  v_items:=coalesce(v_action.payload->'candidates','[]'::jsonb);
  v_count:=jsonb_array_length(v_items);
  if p_selection>v_count then
    return jsonb_build_object(
      'ok',false,'reason','selection_out_of_range','candidate_count',v_count
    );
  end if;

  v_item:=v_items->(p_selection-1);

  perform public.ensure_papoai_commerce_draft_cart_v1(p_conversation_id);

  v_result:=public.set_papoai_commerce_addon_quantity_v1(
    p_conversation_id,
    (v_item->>'product_id')::uuid,
    coalesce(p_quantity,1)
  );

  update public.papoai_commerce_pending_actions
     set status='confirmed',
         resolved_at=now(),
         updated_at=now(),
         payload=payload||jsonb_build_object(
           'selected_index',p_selection,
           'selected_product_id',v_item->>'product_id',
           'selected_product_name',v_item->>'name'
         )
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'selected',jsonb_build_object(
      'index',p_selection,
      'product_id',v_item->>'product_id',
      'name',v_item->>'name',
      'image_url',v_item->>'image_url',
      'commercial_price',v_item->'commercial_price'
    ),
    'cart',v_result
  );
end;
$$;

revoke all on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) to service_role;

revoke all on function public.select_papoai_commerce_product_choice_v1(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function public.select_papoai_commerce_product_choice_v1(uuid,integer,numeric) to service_role;

commit;
