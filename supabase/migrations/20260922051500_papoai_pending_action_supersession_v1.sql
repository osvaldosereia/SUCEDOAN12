begin;

create or replace function public.supersede_papoai_commerce_pending_action_v1(
  p_conversation_id uuid,
  p_new_intent text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_intent text:=lower(trim(coalesce(p_new_intent,'')));
  v_compatible boolean:=false;
  v_candidates jsonb;
  v_item jsonb;
  v_offer_event jsonb;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and status='pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',true,'had_pending',false,'cancelled',false);
  end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;

    return jsonb_build_object(
      'ok',true,'had_pending',true,'expired',true,
      'action_type',v_action.action_type
    );
  end if;

  v_compatible:=case v_action.action_type
    when 'product_choice' then
      v_intent in ('select_product_choice','confirm_pending','cancel_pending')
    when 'value_replacement' then
      v_intent in ('select_product_choice','confirm_pending','cancel_pending')
    when 'delegated_replacement' then
      v_intent in ('confirm_pending','cancel_pending')
    when 'replace_basket_item' then
      v_intent in ('confirm_pending','cancel_pending')
    when 'repeat_last_purchase' then
      v_intent in ('confirm_pending','cancel_pending')
    when 'confirm_order' then
      v_intent in ('confirm_pending','cancel_pending','set_payment_method','cart_summary')
    else false
  end;

  if v_compatible then
    return jsonb_build_object(
      'ok',true,'had_pending',true,'cancelled',false,'compatible',true,
      'action_type',v_action.action_type,'new_intent',v_intent
    );
  end if;

  if v_action.action_type='product_choice'
     and coalesce(v_action.payload->>'choice_kind','')='proactive_offer'
  then
    v_candidates:=coalesce(v_action.payload->'candidates','[]'::jsonb);
    v_item:=case when jsonb_array_length(v_candidates)>0 then v_candidates->0 else null end;

    v_offer_event:=public.record_papoai_product_choice_offer_outcome_v1(
      p_conversation_id,
      v_action.payload,
      'ignored',
      nullif(v_item->>'product_id','')::uuid
    );
  end if;

  update public.papoai_commerce_pending_actions
     set status='cancelled',
         resolved_at=now(),
         updated_at=now(),
         payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
           'cancel_reason','superseded_by_new_customer_intent',
           'superseded_by_intent',v_intent,
           'cancelled_at',now()
         )
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'had_pending',true,
    'cancelled',true,
    'compatible',false,
    'action_type',v_action.action_type,
    'new_intent',v_intent,
    'offer_event',v_offer_event
  );
end;
$$;

revoke all on function public.supersede_papoai_commerce_pending_action_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.supersede_papoai_commerce_pending_action_v1(uuid,text) to service_role;

commit;
