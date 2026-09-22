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
    'value_replacement',
    'delegated_replacement'
  ));

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
  v_preview jsonb;
begin
  v_preview:=public.preview_papoai_commerce_delegated_replacement_v3(
    p_conversation_id,
    p_source_query,
    null,
    0.15,
    p_limit
  );

  if not coalesce((v_preview->>'ok')::boolean,false) then
    return v_preview;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source',v_preview->'source',
    'replacement_budget',v_preview->'target_value',
    'family',v_preview->>'family_key',
    'options',v_preview->'options',
    'count',v_preview->'option_count',
    'calculation_authority','supabase',
    'writes_performed',false,
    'engine','delegated_replacement_v3'
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
begin
  return public.propose_papoai_commerce_delegated_replacement_v1(
    p_conversation_id,
    p_source_query,
    null
  ) || jsonb_build_object(
    'compatibility_alias','value_replacement',
    'engine','delegated_replacement_v3'
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
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_options jsonb;
  v_option jsonb;
  v_result jsonb;
  v_count integer;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id
    and action_type in ('delegated_replacement','value_replacement')
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

  v_options:=coalesce(v_action.payload->'alternatives',v_action.payload->'options','[]'::jsonb);
  v_count:=jsonb_array_length(v_options);

  if p_selection is null or p_selection<1 or p_selection>v_count then
    return jsonb_build_object(
      'ok',false,
      'reason','selection_out_of_range',
      'candidate_count',v_count
    );
  end if;

  v_option:=v_options->(p_selection-1);

  update public.papoai_commerce_pending_actions
     set payload=payload||jsonb_build_object(
       'selected_option',v_option,
       'selected_option_number',p_selection
     ),
     updated_at=now()
   where id=v_action.id;

  v_result:=public.confirm_papoai_commerce_pending_action_v1(
    p_conversation_id,
    true
  );

  return v_result||jsonb_build_object(
    'selected_option_number',p_selection,
    'compatibility_alias','value_replacement',
    'engine','delegated_replacement_v3'
  );
end;
$$;

revoke all on function public.recommend_papoai_commerce_value_replacement_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.recommend_papoai_commerce_value_replacement_v1(uuid,text,integer) to service_role;

revoke all on function public.propose_papoai_commerce_value_replacement_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_value_replacement_v1(uuid,text) to service_role;

revoke all on function public.select_papoai_commerce_value_replacement_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.select_papoai_commerce_value_replacement_v1(uuid,integer) to service_role;

commit;
