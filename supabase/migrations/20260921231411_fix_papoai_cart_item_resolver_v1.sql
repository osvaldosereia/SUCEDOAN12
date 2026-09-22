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
  if v_cart_id is null then
    return jsonb_build_object('found',false,'reason','cart_not_found','candidates','[]'::jsonb);
  end if;

  v_term:=translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  if length(v_term)<2 then
    return jsonb_build_object('found',false,'reason','query_too_short','candidates','[]'::jsonb);
  end if;

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
  ), top5 as (
    select * from ordered where rn<=5
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',id,'name',name,'source',source,'quantity',quantity,'score',round(score::numeric,3)
    ) order by rn),'[]'::jsonb),
    max(score) filter(where rn=1),
    max(score) filter(where rn=2),
    (array_agg(id order by rn))[1],
    (array_agg(name order by rn))[1],
    count(*)
  into v_candidates,v_top_score,v_second_score,v_top_id,v_top_name,v_count
  from top5;

  if coalesce(v_count,0)=0 then
    return jsonb_build_object('found',false,'reason','item_not_found','candidates','[]'::jsonb);
  end if;

  if v_top_score>=0.9 or (v_top_score>=0.68 and (v_second_score is null or v_top_score-v_second_score>=0.08)) then
    return jsonb_build_object(
      'found',true,
      'product_id',v_top_id,
      'name',v_top_name,
      'score',round(v_top_score::numeric,3),
      'candidates',v_candidates
    );
  end if;

  return jsonb_build_object('found',false,'reason','ambiguous_item','candidates',v_candidates);
end;
$$;

revoke all on function public.resolve_papoai_commerce_cart_item_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_cart_item_v1(uuid,text) to service_role;

commit;
