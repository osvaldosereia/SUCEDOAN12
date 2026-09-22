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
    'delegated_replacement'
  ));

create or replace function public.propose_papoai_commerce_delegated_replacement_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_remove_quantity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_preview jsonb;
  v_options jsonb;
  v_choice jsonb;
  v_action_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;
  if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;

  v_preview:=public.preview_papoai_commerce_delegated_replacement_v3(
    p_conversation_id,
    p_source_query,
    p_remove_quantity,
    coalesce(nullif(v_cfg.metadata->>'delegated_replacement_max_difference_pct','')::numeric,15)/100,
    coalesce(nullif(v_cfg.metadata->>'delegated_replacement_max_options','')::integer,3)
  );

  if not coalesce((v_preview->>'ok')::boolean,false) then return v_preview; end if;

  v_options:=coalesce(v_preview->'options','[]'::jsonb);
  if jsonb_array_length(v_options)=0 then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason','no_suitable_replacement_combination',
      'preview',v_preview
    );
  end if;

  v_choice:=v_options->0;

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id
     and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,
    'delegated_replacement',
    'pending',
    jsonb_build_object(
      'source',v_preview->'source',
      'remove_quantity',v_preview->'remove_quantity',
      'target_value',v_preview->'target_value',
      'selected_option',v_choice,
      'alternatives',v_options,
      'ranking_policy',v_preview->>'ranking_policy',
      'prepared_at',now()
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  return jsonb_build_object(
    'ok',true,
    'pending_action_id',v_action_id,
    'action_type','delegated_replacement',
    'source',v_preview->'source',
    'remove_quantity',v_preview->'remove_quantity',
    'target_value',v_preview->'target_value',
    'selected_option',v_choice,
    'alternatives',v_options,
    'requires_confirmation',true,
    'expires_in_seconds',900,
    'writes_performed',false
  );
end;
$$;

create or replace function public.apply_papoai_commerce_delegated_replacement_v1(
  p_conversation_id uuid,
  p_source_product_id uuid,
  p_remove_quantity numeric,
  p_option jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_cart public.carts%rowtype;
  v_source public.cart_items%rowtype;
  v_new_source_qty numeric;
  v_item jsonb;
  v_action text;
  v_product_id uuid;
  v_add_qty numeric;
  v_existing public.cart_items%rowtype;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  if p_option is null or jsonb_typeof(p_option)<>'object'
     or jsonb_typeof(coalesce(p_option->'items','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_option->'items','[]'::jsonb))=0
  then
    raise exception 'delegated_replacement_option_invalid';
  end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1
  for update;
  if not found then raise exception 'cart_not_found'; end if;

  select * into v_source
  from public.cart_items
  where cart_id=v_cart.id
    and product_id=p_source_product_id
    and source='basket'
    and quantity>0
  limit 1
  for update;
  if not found then raise exception 'source_basket_item_not_found'; end if;

  if p_remove_quantity is null
     or p_remove_quantity<=0
     or trunc(p_remove_quantity)<>p_remove_quantity
     or p_remove_quantity>v_source.quantity
  then
    raise exception 'invalid_remove_quantity';
  end if;

  v_new_source_qty:=v_source.quantity-p_remove_quantity;

  perform public.set_papoai_commerce_basket_quantity_v1(
    p_conversation_id,
    p_source_product_id,
    v_new_source_qty
  );

  for v_item in
    select value from jsonb_array_elements(p_option->'items')
  loop
    v_action:=v_item->>'action';
    v_product_id:=(v_item->>'product_id')::uuid;
    v_add_qty:=(v_item->>'quantity')::numeric;

    if v_add_qty is null or v_add_qty<=0 or trunc(v_add_qty)<>v_add_qty then
      raise exception 'delegated_replacement_quantity_invalid';
    end if;

    if v_action='increase_existing' then
      select * into v_existing
      from public.cart_items
      where cart_id=v_cart.id
        and product_id=v_product_id
        and source='basket'
        and quantity>0
      limit 1
      for update;

      if not found then raise exception 'delegated_existing_item_missing'; end if;

      perform public.set_papoai_commerce_basket_quantity_v1(
        p_conversation_id,
        v_product_id,
        v_existing.quantity+v_add_qty
      );

    elsif v_action='add_product' then
      perform public.set_papoai_commerce_addon_quantity_v1(
        p_conversation_id,
        v_product_id,
        v_add_qty
      );
    else
      raise exception 'delegated_replacement_action_invalid';
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'source_product_id',p_source_product_id,
    'removed_quantity',p_remove_quantity,
    'applied_option',p_option,
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id),
    'summary',public.format_papoai_commerce_cart_summary_v1(p_conversation_id)
  );
end;
$$;

create or replace function public.confirm_papoai_commerce_pending_action_v1(
  p_conversation_id uuid,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_result jsonb;
  v_candidates jsonb;
  v_item jsonb;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id and status='pending'
  order by created_at desc limit 1
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','no_pending_action'); end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  if not coalesce(p_confirm,false) then
    update public.papoai_commerce_pending_actions
       set status='cancelled',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',true,'cancelled',true,'action_type',v_action.action_type);
  end if;

  if v_action.action_type='replace_basket_item' then
    v_result:=public.replace_papoai_commerce_basket_item_v2(
      p_conversation_id,
      (v_action.payload#>>'{source,product_id}')::uuid,
      (v_action.payload#>>'{replacement,product_id}')::uuid,
      true
    );
  elsif v_action.action_type='confirm_order' then
    v_result:=public.finalize_papoai_commerce_order_v1(
      p_conversation_id,
      v_action.id
    );
  elsif v_action.action_type='repeat_last_purchase' then
    v_result:=public.apply_papoai_commerce_repeat_last_purchase_v1(
      p_conversation_id,
      (v_action.payload->>'source_order_id')::uuid
    );
  elsif v_action.action_type='product_choice' then
    v_candidates:=coalesce(v_action.payload->'candidates','[]'::jsonb);
    if jsonb_array_length(v_candidates)<>1 then
      return jsonb_build_object(
        'ok',false,
        'reason','product_selection_required',
        'candidate_count',jsonb_array_length(v_candidates),
        'candidates',v_candidates
      );
    end if;

    v_item:=v_candidates->0;
    perform public.ensure_papoai_commerce_draft_cart_v1(p_conversation_id);
    v_result:=jsonb_build_object(
      'ok',true,
      'selected',jsonb_build_object(
        'index',1,
        'product_id',v_item->>'product_id',
        'name',v_item->>'name',
        'image_url',v_item->>'image_url',
        'commercial_price',v_item->'commercial_price'
      ),
      'cart',public.set_papoai_commerce_addon_quantity_v1(
        p_conversation_id,
        (v_item->>'product_id')::uuid,
        1
      )
    );
  elsif v_action.action_type='delegated_replacement' then
    v_result:=public.apply_papoai_commerce_delegated_replacement_v1(
      p_conversation_id,
      (v_action.payload#>>'{source,product_id}')::uuid,
      (v_action.payload->>'remove_quantity')::numeric,
      v_action.payload->'selected_option'
    );
  else
    raise exception 'unsupported_pending_action';
  end if;

  if not coalesce((v_result->>'ok')::boolean,false) then
    if v_result->>'reason'='cart_changed_reconfirm' then
      update public.papoai_commerce_pending_actions
         set status='failed',resolved_at=now(),updated_at=now()
       where id=v_action.id;
    end if;
    return v_result;
  end if;

  update public.papoai_commerce_pending_actions
     set status='confirmed',
         resolved_at=now(),
         updated_at=now(),
         payload=case
           when v_action.action_type='product_choice'
             then payload||jsonb_build_object(
               'selected_index',1,
               'selected_product_id',v_result#>>'{selected,product_id}',
               'selected_product_name',v_result#>>'{selected,name}'
             )
           else payload
         end
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'confirmed',true,
    'action_type',v_action.action_type,
    'result',v_result
  );
end;
$$;

revoke all on function public.propose_papoai_commerce_delegated_replacement_v1(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_delegated_replacement_v1(uuid,text,numeric) to service_role;

revoke all on function public.apply_papoai_commerce_delegated_replacement_v1(uuid,uuid,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.apply_papoai_commerce_delegated_replacement_v1(uuid,uuid,numeric,jsonb) to service_role;

revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;

commit;
