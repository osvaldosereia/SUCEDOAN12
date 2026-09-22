begin;

create or replace function public.get_papoai_commerce_offers_v1(
  p_conversation_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_items jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.offers_enabled,false) then
    return jsonb_build_object('ok',false,'reason','offers_disabled','items','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',p.id,
    'name',p.name,
    'brand',p.brand,
    'category',p.category,
    'regular_price',p.price,
    'offer_price',p.offer_price,
    'commercial_price',p.offer_price,
    'discount_amount',round(greatest(0,p.price-p.offer_price),2),
    'discount_percent',case
      when coalesce(p.price,0)>0 then round(greatest(0,(p.price-p.offer_price)/p.price*100),1)
      else 0
    end,
    'image_url',coalesce(p.image_url,p.image_ai_url,p.image_source_url),
    'reason',o.reason,
    'bought_before',o.bought_before,
    'purchase_count',o.purchase_count,
    'score',o.score
  ) order by o.score desc,p.sort_order,p.name),'[]'::jsonb)
  into v_items
  from public.get_personalized_offers_v1(
    p_conversation_id,
    greatest(1,least(coalesce(p_limit,10),10))
  ) o
  join public.products p on p.id=o.product_id
  where p.is_offer=true
    and coalesce(p.offer_price,0)>0
    and p.offer_price<=p.price
    and p.is_whatsapp_active=true;

  return jsonb_build_object(
    'ok',true,
    'items',v_items,
    'count',jsonb_array_length(v_items),
    'explicit_request_max',10
  );
end;
$$;

create or replace function public.get_papoai_commerce_proactive_offer_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_conv public.conversations%rowtype;
  v_cart public.carts%rowtype;
  v_context jsonb;
  v_offers jsonb;
  v_item jsonb;
  v_discount_pct numeric;
  v_discount_amount numeric;
  v_strong boolean:=false;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.offers_enabled,false) or not coalesce(v_cfg.upsell_enabled,false) then
    return jsonb_build_object('eligible',false,'reason','proactive_offers_disabled');
  end if;

  select * into v_conv from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('eligible',false,'reason','no_active_cart');
  end if;

  if exists(
    select 1
    from public.sales_offer_events e
    where e.conversation_id=p_conversation_id
      and e.cart_id=v_cart.id
      and e.event_type='offered'
      and coalesce((e.context->>'proactive')::boolean,false)=true
  ) then
    return jsonb_build_object('eligible',false,'reason','proactive_offer_already_shown_for_cart');
  end if;

  if exists(
    select 1
    from public.sales_offer_events e
    where (
      (v_conv.customer_id is not null and e.customer_id=v_conv.customer_id)
      or e.conversation_id=p_conversation_id
    )
      and e.event_type in ('declined_all','rejected')
      and e.occurred_at>=now()-interval '7 days'
  ) then
    return jsonb_build_object('eligible',false,'reason','recent_offer_rejection');
  end if;

  v_context:=public.get_papoai_commerce_customer_context_v3(p_conversation_id);
  v_offers:=public.get_papoai_commerce_offers_v1(p_conversation_id,5);
  v_item:=coalesce(v_offers->'items'->0,'{}'::jsonb);

  if coalesce(v_item->>'product_id','')='' then
    return jsonb_build_object('eligible',false,'reason','no_offer_candidate');
  end if;

  v_discount_pct:=coalesce((v_item->>'discount_percent')::numeric,0);
  v_discount_amount:=coalesce((v_item->>'discount_amount')::numeric,0);

  v_strong:=
    coalesce((v_item->>'bought_before')::boolean,false)
    or coalesce((v_item->>'score')::numeric,0)>=50
    or v_discount_pct>=15
    or v_discount_amount>=5;

  if not v_strong then
    return jsonb_build_object(
      'eligible',false,
      'reason','offer_signal_too_weak',
      'candidate',v_item
    );
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason',case
      when coalesce((v_item->>'bought_before')::boolean,false) then 'customer_bought_before'
      when coalesce((v_item->>'score')::numeric,0)>=50 then 'strong_personalized_score'
      else 'meaningful_discount'
    end,
    'cart_id',v_cart.id,
    'customer_known',coalesce((v_context->>'known_customer')::boolean,false),
    'offer',v_item,
    'writes_performed',false
  );
end;
$$;

create or replace function public.record_papoai_commerce_proactive_offer_v1(
  p_conversation_id uuid,
  p_product_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_cart public.carts%rowtype;
  v_offer jsonb;
begin
  select * into v_conv from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('ok',false,'reason','conversation_not_found'); end if;

  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc
  limit 1;

  if not found then return jsonb_build_object('ok',false,'reason','no_active_cart'); end if;

  v_offer:=public.get_papoai_commerce_proactive_offer_v1(p_conversation_id);
  if not coalesce((v_offer->>'eligible')::boolean,false) then
    return jsonb_build_object('ok',false,'reason',v_offer->>'reason');
  end if;

  if (v_offer#>>'{offer,product_id}')::uuid<>p_product_id then
    return jsonb_build_object('ok',false,'reason','offer_candidate_changed');
  end if;

  insert into public.sales_offer_events(
    customer_id,conversation_id,cart_id,product_id,event_type,source,context,occurred_at
  ) values(
    v_conv.customer_id,p_conversation_id,v_cart.id,p_product_id,
    'offered','whatsapp',
    jsonb_build_object(
      'proactive',true,
      'source','papoai_commerce',
      'reason',coalesce(p_reason,v_offer->>'reason'),
      'offer_snapshot',v_offer->'offer'
    ),
    now()
  );

  return jsonb_build_object(
    'ok',true,
    'recorded',true,
    'product_id',p_product_id,
    'cart_id',v_cart.id
  );
end;
$$;

revoke all on function public.get_papoai_commerce_offers_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_offers_v1(uuid,integer) to service_role;

revoke all on function public.get_papoai_commerce_proactive_offer_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_proactive_offer_v1(uuid) to service_role;

revoke all on function public.record_papoai_commerce_proactive_offer_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_papoai_commerce_proactive_offer_v1(uuid,uuid,text) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'explicit_offer_max_items',10,
  'proactive_offer_max_per_cart',1,
  'proactive_offer_rejection_cooldown_days',7,
  'proactive_offer_min_discount_percent',15,
  'proactive_offer_min_discount_amount',5,
  'proactive_offer_policy','strong_signal_only_no_spam'
),
updated_at=now()
where id=1;

commit;
