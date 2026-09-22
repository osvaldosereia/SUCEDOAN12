begin;

create or replace function public.resolve_papoai_commerce_replacement_candidates_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_replacement_query text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_source_match jsonb;
  v_source_id uuid;
  v_source_product public.products%rowtype;
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),8));
  v_items jsonb;
begin
  v_source_match:=public.resolve_papoai_commerce_cart_item_v1(p_conversation_id,p_source_query);
  if not coalesce((v_source_match->>'found')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason',coalesce(v_source_match->>'reason','source_not_found'),
      'source_candidates',coalesce(v_source_match->'candidates','[]'::jsonb),
      'replacement_candidates','[]'::jsonb
    );
  end if;

  v_source_id:=(v_source_match->>'product_id')::uuid;
  select * into v_source_product from public.products where id=v_source_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','source_product_missing','replacement_candidates','[]'::jsonb);
  end if;

  with base as (
    select s.id,s.name,s.brand,s.category,p.subcategory,
           p.customer_category,p.customer_subcategory,
           p.price,p.offer_price,p.is_offer,p.stock,
           coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
           s.score,s.match_mode,
           case
             when coalesce(p.subcategory,'')<>'' and lower(p.subcategory)=lower(coalesce(v_source_product.subcategory,'')) then 3
             when lower(coalesce(p.category,''))=lower(coalesce(v_source_product.category,'')) then 2
             when coalesce(p.customer_subcategory,'')<>'' and lower(p.customer_subcategory)=lower(coalesce(v_source_product.customer_subcategory,'')) then 1
             else 0
           end compatibility
    from public.search_whatsapp_sellable_products_agent_v1(p_replacement_query,greatest(v_limit*4,12)) s
    join public.products p on p.id=s.id
    where s.id<>v_source_id
      and p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
  ), ranked as (
    select *
    from base
    where compatibility>0
    order by compatibility desc,score desc,name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'subcategory',subcategory,
    'commercial_price',case when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price else price end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'compatibility',compatibility,
    'match_score',score,
    'match_mode',match_mode,
    'requires_confirmation',true
  ) order by compatibility desc,score desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'source',jsonb_build_object(
      'product_id',v_source_product.id,
      'name',v_source_product.name,
      'category',v_source_product.category,
      'subcategory',v_source_product.subcategory
    ),
    'replacement_candidates',v_items,
    'count',jsonb_array_length(v_items),
    'requires_confirmation',true,
    'writes_performed',false
  );
end;
$$;

revoke all on function public.resolve_papoai_commerce_replacement_candidates_v1(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_replacement_candidates_v1(uuid,text,text,integer) to service_role;

create or replace function public.replace_papoai_commerce_basket_item_v2(
  p_conversation_id uuid,
  p_source_product_id uuid,
  p_replacement_product_id uuid,
  p_customer_confirmed boolean default false
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
  v_source_product public.products%rowtype;
  v_target public.products%rowtype;
  v_target_commercial numeric;
  v_qty numeric;
  v_source_base numeric;
  v_source_price numeric;
  v_compatible boolean:=false;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;
  if not coalesce(p_customer_confirmed,false) then
    raise exception 'replacement_confirmation_required';
  end if;
  if p_source_product_id=p_replacement_product_id then raise exception 'replacement_same_product'; end if;

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
    and source in ('basket','substitution')
    and quantity>0
  limit 1
  for update;
  if not found then raise exception 'basket_source_product_not_found'; end if;

  select * into v_source_product from public.products where id=p_source_product_id;
  if not found then raise exception 'source_product_missing'; end if;

  select * into v_target
  from public.products
  where id=p_replacement_product_id
    and physically_verified=true
    and is_active=true
    and is_whatsapp_active=true
    and coalesce(price,0)>0
    and coalesce(stock,0)>0;
  if not found then raise exception 'replacement_product_unavailable'; end if;

  v_compatible:=
    (coalesce(v_source_product.subcategory,'')<>'' and lower(v_source_product.subcategory)=lower(coalesce(v_target.subcategory,'')))
    or lower(coalesce(v_source_product.category,''))=lower(coalesce(v_target.category,''))
    or (
      coalesce(v_source_product.customer_subcategory,'')<>''
      and lower(v_source_product.customer_subcategory)=lower(coalesce(v_target.customer_subcategory,''))
    );
  if not v_compatible then raise exception 'replacement_incompatible_category'; end if;

  v_qty:=v_source.quantity;
  if v_target.stock<v_qty then raise exception 'replacement_insufficient_stock'; end if;

  if exists(
    select 1 from public.cart_items
    where cart_id=v_cart.id and product_id=p_replacement_product_id and quantity>0
  ) then raise exception 'replacement_already_in_cart'; end if;

  v_source_base:=coalesce(v_source.base_quantity,v_source.quantity);
  v_source_price:=coalesce(v_source.unit_price,0);
  if v_source_price<=0 then raise exception 'source_price_missing'; end if;

  v_target_commercial:=case
    when v_target.is_offer and coalesce(v_target.offer_price,0)>0 and v_target.offer_price<=v_target.price
      then v_target.offer_price
    else v_target.price
  end;

  update public.cart_items
     set quantity=0,
         commercial_delta=-(v_source_base*v_source_price),
         updated_at=now()
   where id=v_source.id;

  insert into public.cart_items(
    cart_id,product_id,source,quantity,base_quantity,unit_price,line_total,
    commercial_delta,commercial_unit_price,metadata
  ) values(
    v_cart.id,v_target.id,'substitution',v_qty,0,v_target_commercial,
    v_qty*v_target_commercial,v_qty*v_target_commercial,v_target_commercial,
    jsonb_build_object(
      'substitution',true,
      'customer_confirmed',true,
      'replaces_product_id',v_source_product.id,
      'replaces_product_name',v_source_product.name,
      'replacement_product_id',v_target.id,
      'replacement_product_name',v_target.name,
      'regular_price',v_target.price,
      'commercial_price',v_target_commercial,
      'offer_discount_unit',greatest(0,v_target.price-v_target_commercial),
      'compatibility_rule','same_subcategory_or_category',
      'source','papoai_commerce'
    )
  );

  perform public.recalculate_papoai_commerce_cart_v1(v_cart.id);
  return jsonb_build_object(
    'ok',true,
    'replaced',jsonb_build_object(
      'from_product_id',v_source_product.id,
      'from_name',v_source_product.name,
      'to_product_id',v_target.id,
      'to_name',v_target.name
    ),
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id)
  );
end;
$$;

revoke all on function public.replace_papoai_commerce_basket_item_v2(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.replace_papoai_commerce_basket_item_v2(uuid,uuid,uuid,boolean) to service_role;

create or replace function public.resolve_papoai_commerce_addon_v1(
  p_query text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_items jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),8));
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',s.id,
    'name',s.name,
    'brand',s.brand,
    'category',s.category,
    'commercial_price',case when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price then p.offer_price else p.price end,
    'regular_price',p.price,
    'is_offer',coalesce(p.is_offer,false),
    'stock',p.stock,
    'image_url',coalesce(p.image_url,p.image_ai_url,p.image_source_url),
    'match_score',s.score,
    'match_mode',s.match_mode
  ) order by s.score desc,s.name),'[]'::jsonb)
  into v_items
  from public.search_whatsapp_sellable_products_agent_v1(p_query,v_limit) s
  join public.products p on p.id=s.id;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'items',v_items,
    'count',jsonb_array_length(v_items),
    'writes_performed',false
  );
end;
$$;

revoke all on function public.resolve_papoai_commerce_addon_v1(text,integer) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_addon_v1(text,integer) to service_role;

create or replace function public.set_papoai_commerce_addon_by_query_v1(
  p_conversation_id uuid,
  p_query text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_found jsonb;
  v_items jsonb;
  v_item jsonb;
begin
  v_found:=public.resolve_papoai_commerce_addon_v1(p_query,5);
  v_items:=coalesce(v_found->'items','[]'::jsonb);
  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object('ok',false,'needs_clarification',true,'reason','product_not_found','candidates',v_items);
  end if;

  v_item:=v_items->0;

  if jsonb_array_length(v_items)>1
     and coalesce((v_item->>'match_score')::numeric,0)<94 then
    return jsonb_build_object('ok',false,'needs_clarification',true,'reason','ambiguous_product','candidates',v_items);
  end if;

  return jsonb_build_object(
    'ok',true,
    'resolved',jsonb_build_object('product_id',v_item->>'product_id','name',v_item->>'name'),
    'cart',public.set_papoai_commerce_addon_quantity_v1(
      p_conversation_id,
      (v_item->>'product_id')::uuid,
      p_quantity
    )
  );
end;
$$;

revoke all on function public.set_papoai_commerce_addon_by_query_v1(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_addon_by_query_v1(uuid,text,numeric) to service_role;

create or replace function public.format_papoai_commerce_cart_summary_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cart public.carts%rowtype;
  v_basket public.basket_templates%rowtype;
  v_body text;
  v_addons text;
  v_total numeric;
begin
  select * into v_cart
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if not found then return jsonb_build_object('ok',false,'reason','cart_not_found'); end if;

  if v_cart.basket_id is not null then
    select * into v_basket from public.basket_templates where id=v_cart.basket_id;
  end if;

  with rows as (
    select
      coalesce(nullif(p.category,''),'Outros') category,
      min(ci.created_at) over(partition by coalesce(nullif(p.category,''),'Outros')) category_order,
      ci.created_at,
      ci.quantity,
      p.name
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart.id
      and ci.quantity>0
      and ci.source in ('basket','substitution')
  ), grouped as (
    select category,min(category_order) first_order,
           string_agg(
             trim(to_char(quantity,'FM999999990.###'))||'× '||name,
             E'\n' order by created_at,name
           ) lines
    from rows
    group by category
  )
  select string_agg('**'||category||'**'||E'\n'||lines,E'\n\n' order by first_order,category)
  into v_body
  from grouped;

  select string_agg(
    '• '||trim(to_char(ci.quantity,'FM999999990.###'))||'× '||p.name
    ||' — R$ '||replace(to_char(ci.quantity*coalesce(ci.commercial_unit_price,ci.unit_price,0),'FM999999990D00'),'.',','),
    E'\n' order by ci.created_at,p.name
  )
  into v_addons
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  where ci.cart_id=v_cart.id and ci.quantity>0 and ci.source='addon';

  v_total:=v_cart.total;

  return jsonb_build_object(
    'ok',true,
    'cart_id',v_cart.id,
    'basket_name',v_basket.name,
    'total',v_total,
    'message_text',
      coalesce(
        case when v_basket.id is not null
          then '**'||case when lower(v_basket.name)='economica bonini' then 'Econômica Bonini' else v_basket.name end||' personalizada**'||E'\n\n'
          else '**Seu pedido**'||E'\n\n'
        end,''
      )
      ||coalesce(v_body,'')
      ||case when coalesce(v_addons,'')<>'' then E'\n\n**Adicionais**\n'||v_addons else '' end
      ||E'\n\n**Total do pedido: R$ '||replace(to_char(v_total,'FM999999990D00'),'.',',')||'**',
    'component_prices_visible',false,
    'hidden_adjustment_visible',false
  );
end;
$$;

revoke all on function public.format_papoai_commerce_cart_summary_v1(uuid) from public,anon,authenticated;
grant execute on function public.format_papoai_commerce_cart_summary_v1(uuid) to service_role;

create or replace function public.get_papoai_commerce_customer_snapshot_v2(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_contact jsonb;
  v_ctx jsonb;
begin
  v_contact:=public.get_whatsapp_checkout_contact_v1(p_conversation_id);
  v_ctx:=public.get_papoai_commerce_customer_context_v1(p_conversation_id);

  return jsonb_build_object(
    'known_customer',coalesce((v_contact->>'known_customer')::boolean,false),
    'customer_id',v_contact->>'customer_id',
    'name',v_contact->>'name',
    'person_name',v_contact->>'person_name',
    'preferred_reply',v_ctx->>'preferred_reply',
    'order_count',coalesce((v_ctx->>'order_count')::integer,0),
    'last_order_at',v_ctx->>'last_order_at',
    'last_order',v_ctx->'last_order',
    'delivery_profile',jsonb_build_object(
      'base_complete',coalesce((v_contact->>'base_complete')::boolean,false),
      'city',v_contact#>>'{address,city}',
      'neighborhood',v_contact#>>'{address,neighborhood}',
      'has_locator',coalesce(nullif(v_contact->>'locator','') is not null,false)
    ),
    'sensitive_fields_included',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_customer_snapshot_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_customer_snapshot_v2(uuid) to service_role;

create or replace function public.get_papoai_commerce_checkout_readiness_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cart jsonb;
  v_customer jsonb;
  v_summary jsonb;
  v_missing text[]:='{}'::text[];
begin
  v_cart:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
  if not coalesce((v_cart->>'has_cart')::boolean,false) then
    return jsonb_build_object('ready',false,'reason','cart_not_found','missing',jsonb_build_array('cart'));
  end if;

  v_customer:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);
  v_summary:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);

  if not coalesce((v_customer->'delivery_profile'->>'base_complete')::boolean,false) then
    v_missing:=array_append(v_missing,'delivery_address');
  end if;
  if coalesce((v_cart->>'pricing_status'),'')<>'ready' then
    v_missing:=array_append(v_missing,'pricing');
  end if;

  return jsonb_build_object(
    'ready',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing),
    'customer',v_customer,
    'cart',v_cart,
    'summary',v_summary,
    'writes_performed',false
  );
end;
$$;

revoke all on function public.get_papoai_commerce_checkout_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_checkout_readiness_v1(uuid) to service_role;

create or replace function public.execute_papoai_commerce_command_v1(
  p_conversation_id uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_type text:=lower(trim(coalesce(p_command->>'type','')));
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;

  case v_type
    when 'list_baskets' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=jsonb_build_object('ok',true,'baskets',public.get_papoai_commerce_basket_catalog_v1());
    when 'basket_detail' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=public.format_papoai_commerce_basket_message_v1(p_command->>'basket');
    when 'customer_context' then
      v_result:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);
    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(p_command->>'query',nullif(p_command->>'limit','')::integer);
    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(p_conversation_id,coalesce(nullif(p_command->>'limit','')::integer,4));
    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
    when 'cart_summary' then
      v_result:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);
    when 'checkout_readiness' then
      v_result:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);
    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');
    when 'set_basket_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_basket_quantity_by_query_v1(
          p_conversation_id,p_command->>'source_query',(p_command->>'quantity')::numeric
        );
      end if;
    when 'set_addon_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_addon_by_query_v1(
          p_conversation_id,p_command->>'query',(p_command->>'quantity')::numeric
        );
      end if;
    when 'replacement_candidates' then
      v_result:=public.resolve_papoai_commerce_replacement_candidates_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query',
        coalesce(nullif(p_command->>'limit','')::integer,5)
      );
    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v2(
        p_conversation_id,
        (p_command->>'source_product_id')::uuid,
        (p_command->>'replacement_product_id')::uuid,
        coalesce((p_command->>'customer_confirmed')::boolean,false)
      );
    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
  values(
    p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'ready',v_result->>'ready',
      'found',v_result->>'found'
    )
  );

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
    values(
      p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',
      jsonb_build_object('error',sqlerrm)
    );
  exception when others then null;
  end;
  raise;
end;
$$;

revoke all on function public.execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'replacement_policy','same_subcategory_or_category_plus_explicit_customer_confirmation',
  'checkout_policy','readiness_before_any_order_write',
  'customer_context_policy','minimal_no_cpf_no_sensitive_fields'
),
updated_at=now()
where id=1;

commit;
