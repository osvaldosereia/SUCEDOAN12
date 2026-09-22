begin;

create or replace function public.resolve_papoai_commerce_cart_item_v1(
  p_conversation_id uuid,
  p_query text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_cart_id uuid;
  v_term text;
  v_candidates jsonb;
  v_top_score numeric;
  v_second_score numeric;
  v_top_id uuid;
  v_top_name text;
  v_count integer;
begin
  select id into v_cart_id
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if v_cart_id is null then return jsonb_build_object('found',false,'reason','cart_not_found','candidates','[]'::jsonb); end if;

  v_term:=translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  if length(v_term)<2 then return jsonb_build_object('found',false,'reason','query_too_short','candidates','[]'::jsonb); end if;

  with ranked as (
    select
      p.id,
      p.name,
      ci.source,
      ci.quantity,
      greatest(
        case
          when translate(lower(p.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')=v_term then 1
          when translate(lower(p.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') like '%'||v_term||'%' then .95
          else 0
        end,
        extensions.word_similarity(v_term,translate(lower(p.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
        extensions.word_similarity(v_term,translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
      ) score
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart_id and ci.quantity>0
  ), ordered as (
    select *,row_number() over(order by score desc,name) rn
    from ranked
    where score>=0.45
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',id,'name',name,'source',source,'quantity',quantity,'score',round(score::numeric,3)
    ) order by rn),'[]'::jsonb),
    max(score) filter(where rn=1),
    max(score) filter(where rn=2),
    max(id) filter(where rn=1),
    max(name) filter(where rn=1),
    count(*)
  into v_candidates,v_top_score,v_second_score,v_top_id,v_top_name,v_count
  from ordered
  where rn<=5;

  if coalesce(v_count,0)=0 then
    return jsonb_build_object('found',false,'reason','item_not_found','candidates','[]'::jsonb);
  end if;

  if v_top_score>=0.9 or (v_top_score>=0.68 and (v_second_score is null or v_top_score-v_second_score>=0.08)) then
    return jsonb_build_object(
      'found',true,'product_id',v_top_id,'name',v_top_name,'score',round(v_top_score::numeric,3),'candidates',v_candidates
    );
  end if;

  return jsonb_build_object('found',false,'reason','ambiguous_item','candidates',v_candidates);
end;
$$;

revoke all on function public.resolve_papoai_commerce_cart_item_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_cart_item_v1(uuid,text) to service_role;

create or replace function public.set_papoai_commerce_basket_quantity_by_query_v1(
  p_conversation_id uuid,
  p_product_query text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_match jsonb;
begin
  v_match:=public.resolve_papoai_commerce_cart_item_v1(p_conversation_id,p_product_query);
  if not coalesce((v_match->>'found')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason',v_match->>'reason',
      'candidates',coalesce(v_match->'candidates','[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'resolved',jsonb_build_object(
      'product_id',v_match->>'product_id',
      'name',v_match->>'name'
    ),
    'cart',public.set_papoai_commerce_basket_quantity_v1(
      p_conversation_id,
      (v_match->>'product_id')::uuid,
      p_quantity
    )
  );
end;
$$;

revoke all on function public.set_papoai_commerce_basket_quantity_by_query_v1(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_basket_quantity_by_query_v1(uuid,text,numeric) to service_role;

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
      v_result:=public.get_papoai_commerce_customer_context_v1(p_conversation_id);
    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(p_command->>'query',nullif(p_command->>'limit','')::integer);
    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(p_conversation_id,coalesce(nullif(p_command->>'limit','')::integer,4));
    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);
    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');
    when 'set_basket_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric);
      else
        v_result:=public.set_papoai_commerce_basket_quantity_by_query_v1(p_conversation_id,p_command->>'source_query',(p_command->>'quantity')::numeric);
      end if;
    when 'set_addon_quantity' then
      v_result:=public.set_papoai_commerce_addon_quantity_v1(p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric);
    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v1(p_conversation_id,(p_command->>'source_product_id')::uuid,(p_command->>'replacement_product_id')::uuid);
    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
  values(p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object('ok',coalesce((v_result->>'ok')::boolean,true),'found',v_result->>'found'));

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
    values(p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',jsonb_build_object('error',sqlerrm));
  exception when others then null;
  end;
  raise;
end;
$$;

revoke all on function public.execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

commit;
