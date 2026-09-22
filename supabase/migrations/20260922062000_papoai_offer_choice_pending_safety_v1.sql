begin;

create or replace function public.cancel_papoai_commerce_pending_actions_v1(
  p_conversation_id uuid,
  p_reason text default 'superseded_by_new_customer_intent'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer:=0;
begin
  update public.papoai_commerce_pending_actions
     set status='cancelled',
         resolved_at=now(),
         updated_at=now(),
         payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
           'cancel_reason',coalesce(nullif(trim(p_reason),''),'superseded_by_new_customer_intent'),
           'cancelled_at',now()
         )
   where conversation_id=p_conversation_id
     and status='pending';

  get diagnostics v_count=row_count;

  return jsonb_build_object('ok',true,'cancelled',v_count);
end;
$$;

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
      'ok',false,'reason','product_not_found','query',p_query,
      'candidates','[]'::jsonb,
      'personalized',coalesce((v_search->>'personalized')::boolean,false),
      'writes_performed',false
    );
  end if;

  if coalesce(v_cfg.write_enabled,false) then
    perform public.cancel_papoai_commerce_pending_actions_v1(
      p_conversation_id,'new_product_search'
    );

    insert into public.papoai_commerce_pending_actions(
      conversation_id,action_type,status,payload,expires_at
    ) values(
      p_conversation_id,'product_choice','pending',
      jsonb_build_object(
        'query',p_query,
        'candidates',v_items,
        'personalized',coalesce((v_search->>'personalized')::boolean,false),
        'choice_kind','catalog_search'
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

create or replace function public.propose_papoai_commerce_offer_choice_v1(
  p_conversation_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_offers jsonb;
  v_items jsonb;
  v_action_id uuid;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;

  v_offers:=public.get_papoai_commerce_offers_v1(
    p_conversation_id,greatest(1,least(coalesce(p_limit,10),10))
  );
  v_items:=coalesce(v_offers->'items','[]'::jsonb);

  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object('ok',false,'reason','no_active_offers','candidates','[]'::jsonb);
  end if;

  if coalesce(v_cfg.write_enabled,false) then
    perform public.cancel_papoai_commerce_pending_actions_v1(
      p_conversation_id,'customer_requested_offers'
    );

    insert into public.papoai_commerce_pending_actions(
      conversation_id,action_type,status,payload,expires_at
    ) values(
      p_conversation_id,'product_choice','pending',
      jsonb_build_object(
        'query','ofertas',
        'candidates',v_items,
        'choice_kind','explicit_offers',
        'explicit_request',true
      ),
      now()+interval '10 minutes'
    )
    returning id into v_action_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'candidates',v_items,
    'count',jsonb_array_length(v_items),
    'pending_action_id',v_action_id,
    'explicit_request',true,
    'writes_performed',false
  );
end;
$$;

create or replace function public.propose_papoai_commerce_proactive_offer_choice_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_proactive jsonb;
  v_offer jsonb;
  v_action_id uuid;
  v_record jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false)
     or not coalesce(v_cfg.write_enabled,false)
     or not coalesce(v_cfg.offers_enabled,false)
     or not coalesce(v_cfg.upsell_enabled,false)
  then
    return jsonb_build_object('ok',false,'eligible',false,'reason','proactive_offer_write_disabled');
  end if;

  if exists(
    select 1
    from public.papoai_commerce_pending_actions
    where conversation_id=p_conversation_id and status='pending'
  ) then
    return jsonb_build_object('ok',false,'eligible',false,'reason','pending_action_exists');
  end if;

  v_proactive:=public.get_papoai_commerce_proactive_offer_v1(p_conversation_id);
  if not coalesce((v_proactive->>'eligible')::boolean,false) then
    return v_proactive||jsonb_build_object('ok',true);
  end if;

  v_offer:=v_proactive->'offer';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'product_choice','pending',
    jsonb_build_object(
      'query','oferta proativa',
      'candidates',jsonb_build_array(v_offer),
      'choice_kind','proactive_offer',
      'proactive',true,
      'offer_reason',v_proactive->>'reason'
    ),
    now()+interval '10 minutes'
  )
  returning id into v_action_id;

  v_record:=public.record_papoai_commerce_proactive_offer_v1(
    p_conversation_id,
    (v_offer->>'product_id')::uuid,
    v_proactive->>'reason'
  );

  if not coalesce((v_record->>'ok')::boolean,false) then
    raise exception 'proactive_offer_record_failed';
  end if;

  return jsonb_build_object(
    'ok',true,
    'eligible',true,
    'pending_action_id',v_action_id,
    'offer',v_offer,
    'reason',v_proactive->>'reason',
    'requires_confirmation',true
  );
end;
$$;

revoke all on function public.cancel_papoai_commerce_pending_actions_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_papoai_commerce_pending_actions_v1(uuid,text) to service_role;

revoke all on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_product_choice_v1(uuid,text,integer) to service_role;

revoke all on function public.propose_papoai_commerce_offer_choice_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_offer_choice_v1(uuid,integer) to service_role;

revoke all on function public.propose_papoai_commerce_proactive_offer_choice_v1(uuid) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_proactive_offer_choice_v1(uuid) to service_role;

commit;
