begin;

create or replace function public.search_papoai_commerce_products_v1(
  p_query text,
  p_limit integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_limit integer;
  v_query_norm text;
  v_items jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.product_reads_enabled,false) then
    return jsonb_build_object('ok',false,'reason','product_reads_disabled','items','[]'::jsonb);
  end if;

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),12));
  v_query_norm:=translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  with tokens as (
    select distinct token
    from regexp_split_to_table(v_query_norm,E'\\s+') token
    where length(token)>=2
      and token not in ('de','da','do','das','dos','para','com','sem','um','uma','uns','umas')
  ),
  token_stats as (
    select count(*)::integer total_tokens from tokens
  ),
  candidates as (
    select
      s.id,
      p.name,
      p.brand,
      p.category,
      p.subcategory,
      p.packaging,
      p.price,
      p.offer_price,
      p.is_offer,
      p.stock,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      s.score match_score,
      s.match_mode,
      translate(lower(
        concat_ws(' ',p.name,p.brand,p.category,p.subcategory,p.packaging)
      ),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') searchable,
      translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') name_norm,
      translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') brand_norm
    from public.search_whatsapp_sellable_products_agent_v1(
      p_query,
      greatest(v_limit*6,24)
    ) s
    join public.products p on p.id=s.id
  ),
  scored as (
    select
      c.*,
      coalesce((
        select count(*)::integer
        from tokens t
        where c.searchable like '%'||t.token||'%'
      ),0) token_hits,
      (select total_tokens from token_stats) total_tokens,
      case
        when c.name_norm=v_query_norm then 5
        when c.name_norm like v_query_norm||'%' then 4
        when c.name_norm like '%'||v_query_norm||'%' then 3
        else 0
      end phrase_score,
      case
        when c.brand_norm<>'' and v_query_norm like '%'||c.brand_norm||'%' then 1
        else 0
      end brand_requested
    from candidates c
  ),
  ranked as (
    select *,
      (
        phrase_score*1000
        + case when total_tokens>0 and token_hits=total_tokens then 600 else 0 end
        + brand_requested*400
        + token_hits*100
        + coalesce(match_score,0)
      )::numeric relevance_score
    from scored
    order by relevance_score desc,token_hits desc,name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'subcategory',subcategory,
    'packaging',packaging,
    'commercial_price',case
      when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price
      else price
    end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'match_score',match_score,
    'match_mode',match_mode,
    'token_hits',token_hits,
    'total_tokens',total_tokens,
    'relevance_score',relevance_score
  ) order by relevance_score desc,token_hits desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'count',jsonb_array_length(v_items),
    'items',v_items
  );
end;
$$;

revoke all on function public.search_papoai_commerce_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_v1(text,integer) to service_role;

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

revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;

commit;
