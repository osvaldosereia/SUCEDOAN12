begin;

create table if not exists public.papoai_commerce_command_audit (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  command_type text not null,
  command jsonb not null default '{}'::jsonb,
  outcome text not null check(outcome in ('ok','rejected','error')),
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.papoai_commerce_command_audit enable row level security;
revoke all on table public.papoai_commerce_command_audit from public,anon,authenticated;
grant all on table public.papoai_commerce_command_audit to service_role;

create index if not exists papoai_commerce_command_audit_conversation_idx
  on public.papoai_commerce_command_audit(conversation_id,created_at desc);

create or replace function public.format_papoai_commerce_basket_message_v1(p_basket_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_detail jsonb;
  v_basket_id uuid;
  v_name text;
  v_price numeric;
  v_image text;
  v_body text;
begin
  v_detail:=public.get_papoai_commerce_basket_detail_v1(p_basket_query);
  if not coalesce((v_detail->>'found')::boolean,false) then
    return v_detail || jsonb_build_object('message_text',null);
  end if;

  v_basket_id:=(v_detail#>>'{basket,id}')::uuid;
  v_name:=v_detail#>>'{basket,display_name}';
  v_price:=nullif(v_detail#>>'{basket,commercial_price}','')::numeric;

  select coalesce(w.vertical_image_url,b.image_url)
    into v_image
  from public.basket_templates b
  left join public.whatsapp_basket_media_assets w
    on w.basket_id=b.id and w.status='ready'
  where b.id=v_basket_id;

  with item_rows as (
    select
      coalesce(nullif(p.category,''),'Outros') as category,
      bi.sort_order,
      bi.quantity,
      p.name
    from public.basket_template_items bi
    join public.products p on p.id=bi.product_id
    where bi.basket_id=v_basket_id
  ),
  categories as (
    select category,
           min(sort_order) as first_order,
           string_agg(
             (case when quantity=trunc(quantity) then trunc(quantity)::text else trim(to_char(quantity,'FM999999990D99')) end)
             ||'× '||name,
             E'\n' order by sort_order,name
           ) as lines
    from item_rows
    group by category
  )
  select
    '**'||v_name||' — R$ '||replace(to_char(v_price,'FM999999990D00'),'.',',')||'**'
    ||E'\n\n'
    ||string_agg('**'||category||'**'||E'\n'||lines,E'\n\n' order by first_order,category)
  into v_body
  from categories;

  return jsonb_build_object(
    'found',true,
    'basket_id',v_basket_id,
    'basket_name',v_name,
    'commercial_price',v_price,
    'image_url',v_image,
    'message_text',v_body,
    'full_list',true,
    'component_prices_visible',false,
    'hidden_adjustment_visible',false
  );
end;
$$;

revoke all on function public.format_papoai_commerce_basket_message_v1(text) from public,anon,authenticated;
grant execute on function public.format_papoai_commerce_basket_message_v1(text) to service_role;

create or replace function public.search_papoai_commerce_products_v1(
  p_query text,
  p_limit integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_limit integer;
  v_items jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.product_reads_enabled,false) then
    return jsonb_build_object('ok',false,'reason','product_reads_disabled','items','[]'::jsonb);
  end if;

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),12));

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',s.id,
    'name',s.name,
    'brand',s.brand,
    'category',s.category,
    'packaging',s.packaging,
    'commercial_price',case
      when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price then p.offer_price
      else p.price
    end,
    'regular_price',p.price,
    'is_offer',coalesce(p.is_offer,false),
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
    'count',jsonb_array_length(v_items),
    'items',v_items
  );
end;
$$;

revoke all on function public.search_papoai_commerce_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_v1(text,integer) to service_role;

create or replace function public.get_papoai_commerce_offers_v1(
  p_conversation_id uuid,
  p_limit integer default 4
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
    'regular_price',p.price,
    'offer_price',p.offer_price,
    'image_url',coalesce(p.image_url,p.image_ai_url,p.image_source_url),
    'reason',o.reason,
    'bought_before',o.bought_before,
    'score',o.score
  ) order by o.score desc,p.name),'[]'::jsonb)
  into v_items
  from public.get_personalized_offers_v1(p_conversation_id,greatest(1,least(coalesce(p_limit,4),8))) o
  join public.products p on p.id=o.product_id;

  return jsonb_build_object('ok',true,'items',v_items,'count',jsonb_array_length(v_items));
end;
$$;

revoke all on function public.get_papoai_commerce_offers_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_offers_v1(uuid,integer) to service_role;

create or replace function public.start_papoai_commerce_basket_v1(
  p_conversation_id uuid,
  p_basket_query text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_detail jsonb;
  v_basket_id uuid;
  v_started jsonb;
  v_cart_id uuid;
  v_hidden numeric;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) or not coalesce(v_cfg.write_enabled,false) then
    raise exception 'papoai_commerce_write_disabled';
  end if;

  v_detail:=public.get_papoai_commerce_basket_detail_v1(p_basket_query);
  if not coalesce((v_detail->>'found')::boolean,false) then return v_detail; end if;
  v_basket_id:=(v_detail#>>'{basket,id}')::uuid;

  v_hidden:=public.refresh_basket_hidden_adjustment_v1(v_basket_id);

  v_started:=public.start_basket_cart(p_conversation_id,v_basket_id);
  v_cart_id:=(v_started->>'cart_id')::uuid;

  update public.carts
     set basket_hidden_adjustment=coalesce(v_hidden,0),
         updated_at=now()
   where id=v_cart_id;

  perform public.recalculate_papoai_commerce_cart_v1(v_cart_id);

  return jsonb_build_object(
    'ok',true,
    'basket',v_detail->'basket',
    'cart',public.get_papoai_commerce_cart_state_v1(p_conversation_id)
  );
end;
$$;

revoke all on function public.start_papoai_commerce_basket_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.start_papoai_commerce_basket_v1(uuid,text) to service_role;

create or replace function public.get_papoai_commerce_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
with basket_health as (
  select
    count(*) filter(where b.is_active and b.is_whatsapp_active) as active_baskets,
    count(*) filter(
      where b.is_active and b.is_whatsapp_active
        and abs(coalesce(b.hidden_adjustment,0)-coalesce(public.calculate_basket_hidden_adjustment_v1(b.id),0))>0.01
    ) as hidden_adjustment_mismatches,
    count(*) filter(
      where b.is_active and b.is_whatsapp_active
        and not exists(select 1 from public.basket_template_items i where i.basket_id=b.id)
    ) as empty_baskets
  from public.basket_templates b
), product_health as (
  select
    count(*) filter(where is_active and is_whatsapp_active and physically_verified and coalesce(stock,0)>0 and coalesce(price,0)>0) as sellable_products,
    count(*) filter(where is_active and is_whatsapp_active and physically_verified and coalesce(stock,0)>0 and coalesce(price,0)>0 and coalesce(image_url,image_ai_url,image_source_url) is not null) as sellable_with_image
  from public.products
)
select jsonb_build_object(
  'ok',(b.hidden_adjustment_mismatches=0 and b.empty_baskets=0),
  'active_baskets',b.active_baskets,
  'hidden_adjustment_mismatches',b.hidden_adjustment_mismatches,
  'empty_baskets',b.empty_baskets,
  'sellable_products',p.sellable_products,
  'sellable_with_image',p.sellable_with_image,
  'config',public.get_papoai_commerce_brain_config_v1()
)
from basket_health b cross join product_health p;
$$;

revoke all on function public.get_papoai_commerce_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_readiness_v1() to service_role;

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
  if not coalesce(v_cfg.enabled,false) then
    raise exception 'papoai_commerce_brain_disabled';
  end if;

  case v_type
    when 'list_baskets' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=jsonb_build_object('ok',true,'baskets',public.get_papoai_commerce_basket_catalog_v1());

    when 'basket_detail' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=public.format_papoai_commerce_basket_message_v1(p_command->>'basket');

    when 'customer_context' then
      v_result:=public.get_papoai_commerce_customer_context_v1(p_conversation_id);

    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(
        p_command->>'query',
        nullif(p_command->>'limit','')::integer
      );

    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(
        p_conversation_id,
        coalesce(nullif(p_command->>'limit','')::integer,4)
      );

    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);

    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');

    when 'set_basket_quantity' then
      v_result:=public.set_papoai_commerce_basket_quantity_v1(
        p_conversation_id,
        (p_command->>'product_id')::uuid,
        (p_command->>'quantity')::numeric
      );

    when 'set_addon_quantity' then
      v_result:=public.set_papoai_commerce_addon_quantity_v1(
        p_conversation_id,
        (p_command->>'product_id')::uuid,
        (p_command->>'quantity')::numeric
      );

    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v1(
        p_conversation_id,
        (p_command->>'source_product_id')::uuid,
        (p_command->>'replacement_product_id')::uuid
      );

    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(
    conversation_id,command_type,command,outcome,result_summary
  ) values(
    p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'has_cart',v_result->>'has_cart',
      'found',v_result->>'found'
    )
  );

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(
      conversation_id,command_type,command,outcome,result_summary
    ) values(
      p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',
      jsonb_build_object('error',sqlerrm)
    );
  exception when others then
    null;
  end;
  raise;
end;
$$;

revoke all on function public.execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'basket_contents_policy','always_full_list_one_message_grouped_by_category',
  'component_prices_visible',false,
  'hidden_adjustment_visible',false,
  'pricing_authority','supabase',
  'ai_may_calculate_totals',false,
  'max_history_messages',12,
  'product_media_policy','use_image_for_specific_product_offer_upsell_when_helpful'
),
updated_at=now()
where id=1;

commit;
