begin;

create or replace function public.get_whatsapp_sellable_product_v1(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id,'sku',p.sku,'gtin',p.gtin,'name',p.name,'brand',p.brand,
    'category',p.category,'packaging',p.packaging,'price',p.price,'stock',p.stock,
    'image_url',p.image_url,'description_short',p.description_short,
    'gondola',p.gondola,'shelf',p.shelf,'source','counter_verified'
  ) end
  from public.products p
  where p.id=p_product_id
    and p.physically_verified=true
    and p.is_active=true
    and p.is_whatsapp_active=true
    and p.price is not null
    and p.price>=0
    and coalesce(p.stock,0)>0
$$;

create or replace function public.search_whatsapp_sellable_products_v1(p_query text, p_limit integer default 8)
returns table(id uuid, sku text, gtin text, name text, brand text, category text, packaging text, price numeric, stock numeric, image_url text, gondola text, shelf text, score integer)
language sql
stable
security definer
set search_path=''
as $$
with q as (
  select translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as term,
         greatest(1,least(coalesce(p_limit,8),20)) as lim
), normalized as (
  select p.*,
    translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as n_name,
    translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as n_brand,
    translate(lower(coalesce(p.category,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as n_category
  from public.products p
  where p.physically_verified=true
    and p.is_active=true
    and p.is_whatsapp_active=true
    and p.price is not null
    and p.price>=0
    and coalesce(p.stock,0)>0
), ranked as (
  select p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.price,p.stock,p.image_url,p.gondola,p.shelf,
    case
      when q.term<>'' and lower(coalesce(p.gtin,''))=q.term then 100
      when q.term<>'' and lower(coalesce(p.sku,''))=q.term then 98
      when q.term<>'' and p.n_name=q.term then 96
      when q.term<>'' and p.n_name like q.term||'%' then 94
      when q.term<>'' and strpos(p.n_name,q.term) between 1 and 14 then 90
      when q.term<>'' and p.n_name like '%'||q.term||'%' then 80
      when q.term<>'' and p.n_brand like '%'||q.term||'%' then 70
      when q.term<>'' and p.n_category like '%'||q.term||'%' then 60
      else 10
    end as score,
    case when q.term='' then 9999 else nullif(strpos(p.n_name,q.term),0) end as term_position,
    p.sort_order
  from normalized p cross join q
  where q.term=''
     or lower(coalesce(p.gtin,''))=q.term
     or lower(coalesce(p.sku,''))=q.term
     or p.n_name like '%'||q.term||'%'
     or p.n_brand like '%'||q.term||'%'
     or p.n_category like '%'||q.term||'%'
)
select r.id,r.sku,r.gtin,r.name,r.brand,r.category,r.packaging,r.price,r.stock,r.image_url,r.gondola,r.shelf,r.score
from ranked r cross join q
order by r.score desc,r.term_position nulls last,r.sort_order nulls last,r.name,r.id
limit (select lim from q)
$$;

revoke all on function public.get_whatsapp_sellable_product_v1(uuid) from public,anon,authenticated;
revoke all on function public.search_whatsapp_sellable_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.get_whatsapp_sellable_product_v1(uuid) to service_role;
grant execute on function public.search_whatsapp_sellable_products_v1(text,integer) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'standalone_product_search_policy','active_verified_whatsapp_priced_stock',
  'standalone_product_search_write_policy_aligned',true,
  'implementation_stage','standalone_product_channel_consistency_v32'
),updated_at=now()
where slug='flow-cestas-comercial-v2';

commit;
