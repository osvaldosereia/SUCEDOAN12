begin;

create or replace function public.resolve_papoai_commerce_addon_v1(
  p_query text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_items jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),8));
  v_query_norm text;
begin
  v_query_norm:=translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  with candidates as (
    select
      s.id,s.name,s.brand,s.category,
      p.price,p.offer_price,p.is_offer,p.stock,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      s.score,s.match_mode,
      translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') name_norm,
      greatest(
        extensions.similarity(v_query_norm,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
        extensions.word_similarity(v_query_norm,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
      ) semantic_score
    from public.search_whatsapp_sellable_products_agent_v1(p_query,greatest(v_limit*3,12)) s
    join public.products p on p.id=s.id
  ), ranked as (
    select *,
      case
        when name_norm=v_query_norm then 3
        when name_norm like v_query_norm||'%' then 2
        when name_norm like '%'||v_query_norm||'%' then 2
        else 1
      end exactness
    from candidates
    order by exactness desc,semantic_score desc,score desc,name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'commercial_price',case when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price else price end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'match_score',score,
    'semantic_score',round(semantic_score::numeric,3),
    'exactness',exactness,
    'match_mode',match_mode
  ) order by exactness desc,semantic_score desc,score desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'items',v_items,
    'count',jsonb_array_length(v_items),
    'writes_performed',false
  );
end;
$$;

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
  v_second jsonb;
  v_top_exactness integer;
  v_top_semantic numeric;
  v_second_semantic numeric;
  v_safe boolean:=false;
begin
  v_found:=public.resolve_papoai_commerce_addon_v1(p_query,5);
  v_items:=coalesce(v_found->'items','[]'::jsonb);

  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object(
      'ok',false,'needs_clarification',true,'reason','product_not_found','candidates',v_items
    );
  end if;

  v_item:=v_items->0;
  v_second:=case when jsonb_array_length(v_items)>1 then v_items->1 else null end;
  v_top_exactness:=coalesce((v_item->>'exactness')::integer,0);
  v_top_semantic:=coalesce((v_item->>'semantic_score')::numeric,0);
  v_second_semantic:=coalesce((v_second->>'semantic_score')::numeric,0);

  v_safe:=
    v_top_exactness>=2
    or (
      v_top_semantic>=0.82
      and (v_second is null or v_top_semantic-v_second_semantic>=0.10)
    );

  if not v_safe then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason','ambiguous_product',
      'candidates',v_items
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'resolved',jsonb_build_object(
      'product_id',v_item->>'product_id',
      'name',v_item->>'name'
    ),
    'cart',public.set_papoai_commerce_addon_quantity_v1(
      p_conversation_id,
      (v_item->>'product_id')::uuid,
      p_quantity
    )
  );
end;
$$;

revoke all on function public.resolve_papoai_commerce_addon_v1(text,integer) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_addon_v1(text,integer) to service_role;
revoke all on function public.set_papoai_commerce_addon_by_query_v1(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.set_papoai_commerce_addon_by_query_v1(uuid,text,numeric) to service_role;

commit;
