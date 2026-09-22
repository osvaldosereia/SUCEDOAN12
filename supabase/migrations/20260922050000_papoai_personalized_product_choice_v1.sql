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

  v_search:=public.search_papoai_commerce_products_for_customer_v1(
    p_conversation_id,p_query,v_limit
  );
  v_items:=coalesce(v_search->'items','[]'::jsonb);

  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object(
      'ok',false,
      'reason','product_not_found',
      'query',p_query,
      'candidates','[]'::jsonb,
      'personalized',coalesce((v_search->>'personalized')::boolean,false),
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
        'candidates',v_items,
        'personalized',coalesce((v_search->>'personalized')::boolean,false)
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
    'personalized',coalesce((v_search->>'personalized')::boolean,false),
    'customer_context',v_search->'customer_context',
    'writes_performed',false
  );
end;
$$;

revoke all on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) to service_role;

commit;
