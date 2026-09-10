begin;

create or replace function public.search_whatsapp_sellable_products_agent_v1(p_query text,p_limit integer default 8)
returns table(id uuid,sku text,gtin text,name text,brand text,category text,packaging text,price numeric,stock numeric,image_url text,gondola text,shelf text,score integer,canonical_query text,match_mode text)
language sql
stable
security definer
set search_path=''
as $$
with q as (
  select public.canonicalize_whatsapp_product_query_v2(p_query) as term,
         greatest(1,least(coalesce(p_limit,8),20)) as lim,
         coalesce((public.match_whatsapp_product_vocabulary_v1(p_query)->>'matched')::boolean,false) as vocab_matched
), exact_hits as (
  select s.*,q.term as canonical_query,'exact'::text as match_mode
  from q cross join lateral public.search_whatsapp_sellable_products_v1(q.term,q.lim) s
  where (not q.vocab_matched) or s.score>=90
), fuzzy_pool as (
  select p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.price,p.stock,p.image_url,p.gondola,p.shelf,q.term as canonical_query,
    greatest(
      extensions.word_similarity(q.term,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.category,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
    ) as sim
  from public.products p cross join q
  where not q.vocab_matched
    and not exists(select 1 from exact_hits)
    and length(q.term)>=4
    and p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0
), fuzzy_hits as (
  select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,
         greatest(50,least(79,round(f.sim*100)::int)) as score,f.canonical_query,'fuzzy'::text as match_mode
  from fuzzy_pool f where f.sim>=0.68 order by f.sim desc,f.name,f.id limit (select lim from q)
)
select e.id,e.sku,e.gtin,e.name,e.brand,e.category,e.packaging,e.price,e.stock,e.image_url,e.gondola,e.shelf,e.score,e.canonical_query,e.match_mode from exact_hits e
union all
select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,f.score,f.canonical_query,f.match_mode from fuzzy_hits f
limit (select lim from q);
$$;

revoke all on function public.search_whatsapp_sellable_products_agent_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_whatsapp_sellable_products_agent_v1(text,integer) to service_role;

commit;