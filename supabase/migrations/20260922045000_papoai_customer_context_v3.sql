begin;

create or replace function public.get_papoai_commerce_customer_context_v3(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_snapshot jsonb;
  v_memory jsonb;
  v_frequent jsonb;
  v_direct jsonb:='[]'::jsonb;
  v_soft jsonb:='[]'::jsonb;
  v_mem jsonb;
begin
  select * into v_conv
  from public.conversations
  where id=p_conversation_id;

  if not found then
    return jsonb_build_object(
      'known_customer',false,
      'personalization_available',false,
      'direct_preferences','[]'::jsonb,
      'soft_preferences','[]'::jsonb,
      'frequent_products','[]'::jsonb,
      'recent_extras','[]'::jsonb,
      'favorite_basket',null,
      'sensitive_fields_included',false
    );
  end if;

  v_snapshot:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);
  v_memory:=public.get_agent_core_selective_memory_v1(p_conversation_id);

  if v_conv.customer_id is not null then
    v_frequent:=public.get_customer_frequent_purchases_v1(v_conv.customer_id,10,6);
  else
    v_frequent:='{}'::jsonb;
  end if;

  for v_mem in
    select value
    from jsonb_array_elements(coalesce(v_memory->'memories','[]'::jsonb))
  loop
    if coalesce(v_mem->>'source_kind','')='declared'
       and coalesce((v_mem->>'confidence')::numeric,0)>=0.60
    then
      v_direct:=v_direct||jsonb_build_array(
        jsonb_build_object(
          'key',v_mem->>'key',
          'value',v_mem->>'value',
          'confidence',v_mem->'confidence',
          'source_kind','declared',
          'strength','direct'
        )
      );
    elsif coalesce(v_mem->>'source_kind','')='imported'
       and coalesce((v_mem->>'confidence')::numeric,0)>=0.90
    then
      v_direct:=v_direct||jsonb_build_array(
        jsonb_build_object(
          'key',v_mem->>'key',
          'value',v_mem->>'value',
          'confidence',v_mem->'confidence',
          'source_kind','imported',
          'strength','direct'
        )
      );
    elsif coalesce(v_mem->>'source_kind','')='inferred'
       and coalesce((v_mem->>'confidence')::numeric,0)>=0.85
       and coalesce((v_mem->>'evidence_count')::integer,0)>=2
    then
      v_soft:=v_soft||jsonb_build_array(
        jsonb_build_object(
          'key',v_mem->>'key',
          'value',v_mem->>'value',
          'confidence',v_mem->'confidence',
          'source_kind','inferred',
          'evidence_count',v_mem->'evidence_count',
          'strength','soft'
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'known_customer',coalesce((v_snapshot->>'known_customer')::boolean,false),
    'customer_id',v_conv.customer_id,
    'first_name',case
      when nullif(trim(coalesce(v_snapshot->>'person_name',v_snapshot->>'name','')),'') is null then null
      else split_part(trim(coalesce(v_snapshot->>'person_name',v_snapshot->>'name','')),' ',1)
    end,
    'preferred_reply',v_snapshot->>'preferred_reply',
    'order_count',coalesce((v_snapshot->>'order_count')::integer,0),
    'last_order_at',v_snapshot->>'last_order_at',
    'last_order',v_snapshot->'last_order',
    'delivery_ready',coalesce((v_snapshot#>>'{delivery_profile,base_complete}')::boolean,false),
    'conversation_summary',left(coalesce(v_memory->>'summary',''),500),
    'direct_preferences',v_direct,
    'soft_preferences',v_soft,
    'favorite_basket',v_frequent->'favorite_basket',
    'frequent_products',coalesce(v_frequent->'frequent_products','[]'::jsonb),
    'recent_extras',coalesce(v_frequent->'recent_extras','[]'::jsonb),
    'history_confidence',v_frequent->>'history_confidence',
    'purchase_frequency_label',v_frequent->>'frequency_label',
    'personalization_available',
      v_conv.customer_id is not null
      and (
        jsonb_array_length(v_direct)>0
        or jsonb_array_length(v_soft)>0
        or jsonb_array_length(coalesce(v_frequent->'frequent_products','[]'::jsonb))>0
        or v_frequent->'favorite_basket' is not null
      ),
    'memory_policy',jsonb_build_object(
      'declared_min_confidence',0.60,
      'imported_min_confidence',0.90,
      'inferred_min_confidence',0.85,
      'inferred_min_evidence',2,
      'weak_inferences_ignored',true
    ),
    'sensitive_fields_included',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_customer_context_v3(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_customer_context_v3(uuid) to service_role;

create or replace function public.search_papoai_commerce_products_for_customer_v1(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_context jsonb;
  v_search jsonb;
  v_items jsonb;
  v_direct jsonb;
  v_soft jsonb;
  v_frequent jsonb;
  v_ranked jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),12));
begin
  v_context:=public.get_papoai_commerce_customer_context_v3(p_conversation_id);
  v_search:=public.search_papoai_commerce_products_v1(p_query,12);
  v_items:=coalesce(v_search->'items','[]'::jsonb);
  v_direct:=coalesce(v_context->'direct_preferences','[]'::jsonb);
  v_soft:=coalesce(v_context->'soft_preferences','[]'::jsonb);
  v_frequent:=coalesce(v_context->'frequent_products','[]'::jsonb);

  with candidates as (
    select
      item,
      item->>'product_id' product_id,
      lower(coalesce(item->>'name','')) name_norm,
      lower(coalesce(item->>'brand','')) brand_norm,
      lower(coalesce(item->>'category','')) category_norm,
      coalesce((item->>'relevance_score')::numeric,0) base_score
    from jsonb_array_elements(v_items) item
  ),
  personalized as (
    select
      c.*,
      (
        select coalesce(sum(
          case d->>'key'
            when 'preferred_brand' then
              case when c.brand_norm like '%'||lower(d->>'value')||'%' then 350 else 0 end
            when 'preferred_product' then
              case when c.name_norm like '%'||lower(d->>'value')||'%' then 300 else 0 end
            when 'preferred_category' then
              case when c.category_norm like '%'||lower(d->>'value')||'%' then 180 else 0 end
            else 0
          end
        ),0)
        from jsonb_array_elements(v_direct) d
      ) direct_bonus,
      (
        select coalesce(sum(
          case s->>'key'
            when 'preferred_brand' then
              case when c.brand_norm like '%'||lower(s->>'value')||'%' then 90 else 0 end
            when 'preferred_product' then
              case when c.name_norm like '%'||lower(s->>'value')||'%' then 80 else 0 end
            when 'preferred_category' then
              case when c.category_norm like '%'||lower(s->>'value')||'%' then 50 else 0 end
            else 0
          end
        ),0)
        from jsonb_array_elements(v_soft) s
      ) soft_bonus,
      (
        select case
          when exists(
            select 1
            from jsonb_array_elements(v_frequent) f
            where f->>'product_id'=c.product_id
              and coalesce((f->>'available')::boolean,false)
          ) then 120
          else 0
        end
      ) frequent_bonus,
      (
        select case
          when exists(
            select 1
            from jsonb_array_elements(v_direct) a
            where a->>'key'='avoid_product'
              and c.name_norm like '%'||lower(a->>'value')||'%'
          ) then 5000
          else 0
        end
      ) avoid_penalty
    from candidates c
  ),
  ranked as (
    select
      *,
      base_score+direct_bonus+soft_bonus+frequent_bonus-avoid_penalty final_score
    from personalized
    order by final_score desc,base_score desc,name_norm
    limit v_limit
  )
  select coalesce(jsonb_agg(
    item||jsonb_build_object(
      'personalized_score',final_score,
      'personalization',jsonb_build_object(
        'direct_bonus',direct_bonus,
        'soft_bonus',soft_bonus,
        'frequent_bonus',frequent_bonus,
        'avoid_penalty',avoid_penalty
      )
    )
    order by final_score desc,base_score desc,name_norm
  ),'[]'::jsonb)
  into v_ranked
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'count',jsonb_array_length(v_ranked),
    'items',v_ranked,
    'personalized',coalesce((v_context->>'personalization_available')::boolean,false),
    'customer_context',jsonb_build_object(
      'first_name',v_context->'first_name',
      'favorite_basket',v_context->'favorite_basket',
      'direct_preference_count',jsonb_array_length(v_direct),
      'soft_preference_count',jsonb_array_length(v_soft),
      'frequent_product_count',jsonb_array_length(v_frequent)
    )
  );
end;
$$;

revoke all on function public.search_papoai_commerce_products_for_customer_v1(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_for_customer_v1(uuid,text,integer) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'customer_context_version','v3',
  'declared_memory_can_personalize',true,
  'inferred_memory_min_confidence',0.85,
  'inferred_memory_min_evidence',2,
  'customer_memory_sensitive_fields_allowed',false
),
updated_at=now()
where id=1;

commit;
