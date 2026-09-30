create or replace function public.papoai_resolve_product_intent_v1(p_query text,p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
with q0 as (
  select regexp_replace(
    translate(lower(trim(coalesce(p_query,''))),
      'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+',' ','g'
  ) as norm,
  greatest(1,least(coalesce(p_limit,5),10)) as lim
), tokens as (
  select distinct t as token
  from q0, regexp_split_to_table(q0.norm,'\s+') t
  where length(t)>=2
    and t not in ('quero','queria','manda','mande','mandar','me','pra','para','por','favor','favorzinho','um','uma','uns','umas','de','da','do','das','dos','e','com','coloca','coloque','adiciona','adicione','preciso','comprar','produto','produtos','unidade','unidades','un')
), token_count as (
  select count(*)::int n from tokens
), base as (
  select
    p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.image_url,
    case when p.is_offer=true and p.offer_price is not null and p.offer_price>=0 then p.offer_price else p.price end as price,
    greatest(0,coalesce(s.loose_sellable_stock,0))::numeric as stock,
    regexp_replace(translate(lower(concat_ws(' ',p.name,p.brand,p.packaging,p.category,p.sku,p.gtin)),
      'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g') as hay,
    regexp_replace(translate(lower(coalesce(p.name,'')),
      'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g') as n_name
  from public.products p
  join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
  where p.is_active=true and p.physically_verified=true and p.price is not null and p.price>0 and coalesce(s.loose_sellable_stock,0)>0
), scored as (
  select b.*,
         (select count(*) from tokens t where (' '||b.hay||' ') like '% '||t.token||' %' or replace(b.hay,' ','') like '%'||t.token||'%')::int as matched,
         (select n from token_count) as token_total,
         case when b.n_name=(select trim(norm) from q0) then 100
              when b.n_name like (select trim(norm) from q0)||'%' then 95
              else 80 end as score
  from base b
), matches as (
  select * from scored where token_total>0 and matched=token_total
), limited as (
  select * from matches order by score desc,name,id limit (select lim from q0)
), agg as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,'sku',sku,'gtin',gtin,'name',name,'brand',brand,
    'category',category,'packaging',packaging,'price',price,'stock',stock,
    'image_url',image_url,'score',score
  ) order by score desc,name,id),'[]'::jsonb) as candidates
  from limited
), total as (
  select count(*)::int as n from matches
)
select jsonb_build_object(
  'ok',true,'query',p_query,'normalized_query',(select trim(norm) from q0),
  'token_count',(select n from token_count),'candidate_count',(select n from total),
  'resolved',(select n from total)=1,'ambiguous',(select n from total)>1,
  'reason',case when (select n from token_count)=0 then 'query_too_generic'
                when (select n from total)=1 then 'exact_candidate'
                when (select n from total)>1 then 'multiple_candidates'
                else 'no_candidate' end,
  'candidates',(select candidates from agg)
);
$$;

revoke all on function public.papoai_resolve_product_intent_v1(text,integer) from public,anon,authenticated;
grant execute on function public.papoai_resolve_product_intent_v1(text,integer) to service_role;
