begin;

create or replace function public.record_papoai_product_choice_offer_outcome_v1(
  p_conversation_id uuid,
  p_action_payload jsonb,
  p_event_type text,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_kind text:=coalesce(p_action_payload->>'choice_kind','');
  v_context jsonb;
begin
  if v_kind not in ('explicit_offers','proactive_offer') then
    return jsonb_build_object('ok',true,'recorded',false,'reason','not_offer_choice');
  end if;

  v_context:=jsonb_build_object(
    'choice_kind',v_kind,
    'proactive',coalesce((p_action_payload->>'proactive')::boolean,false),
    'explicit_request',coalesce((p_action_payload->>'explicit_request')::boolean,false),
    'offer_reason',p_action_payload->>'offer_reason',
    'source','papoai_commerce'
  );

  perform public.record_sales_offer_event(
    p_conversation_id,
    p_event_type,
    p_product_id,
    'whatsapp',
    v_context
  );

  return jsonb_build_object(
    'ok',true,
    'recorded',true,
    'event_type',p_event_type,
    'choice_kind',v_kind,
    'product_id',p_product_id
  );
end;
$$;

revoke all on function public.record_papoai_product_choice_offer_outcome_v1(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.record_papoai_product_choice_offer_outcome_v1(uuid,jsonb,text,uuid) to service_role;

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
  v_offer_event jsonb;
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

  v_offer_event:=public.record_papoai_product_choice_offer_outcome_v1(
    p_conversation_id,
    v_action.payload,
    'added',
    (v_item->>'product_id')::uuid
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
    'cart',v_result,
    'offer_event',v_offer_event
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
  v_offer_event jsonb;
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
    if v_action.action_type='product_choice'
       and coalesce(v_action.payload->>'choice_kind','')='proactive_offer'
    then
      v_candidates:=coalesce(v_action.payload->'candidates','[]'::jsonb);
      v_item:=case when jsonb_array_length(v_candidates)>0 then v_candidates->0 else null end;
      v_offer_event:=public.record_papoai_product_choice_offer_outcome_v1(
        p_conversation_id,
        v_action.payload,
        'rejected',
        nullif(v_item->>'product_id','')::uuid
      );
    elsif v_action.action_type='product_choice'
       and coalesce(v_action.payload->>'choice_kind','')='explicit_offers'
    then
      v_offer_event:=public.record_papoai_product_choice_offer_outcome_v1(
        p_conversation_id,
        v_action.payload,
        'declined_all',
        null
      );
    end if;

    update public.papoai_commerce_pending_actions
       set status='cancelled',
           resolved_at=now(),
           updated_at=now(),
           payload=payload||jsonb_build_object(
             'declined',true,
             'declined_at',now()
           )
     where id=v_action.id;

    return jsonb_build_object(
      'ok',true,
      'cancelled',true,
      'action_type',v_action.action_type,
      'offer_event',v_offer_event
    );
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

    v_offer_event:=public.record_papoai_product_choice_offer_outcome_v1(
      p_conversation_id,
      v_action.payload,
      'added',
      (v_item->>'product_id')::uuid
    );
    v_result:=v_result||jsonb_build_object('offer_event',v_offer_event);

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

revoke all on function public.select_papoai_commerce_product_choice_v1(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function public.select_papoai_commerce_product_choice_v1(uuid,integer,numeric) to service_role;

revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;

commit;
