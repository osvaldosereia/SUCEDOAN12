begin;

-- The storefront taxonomy requires every public basket to belong to a subdivision.
-- Keep the operation idempotent so replaying the migration is safe.
insert into public.basket_subcategories(category_id,name,sort_order,is_active)
select c.id,'Econômica',50,true
from public.basket_categories c
where c.slug='cestas-so-alimentos'
  and not exists (
    select 1
    from public.basket_subcategories s
    where s.category_id=c.id and lower(s.name)=lower('Econômica')
  );

with target as (
  select bt.id,
         bt.category_id,
         case
           when lower(bt.name) like 'grande%' then 'Grande'
           when lower(bt.name) like 'média%' or lower(bt.name) like 'media%' then 'Média'
           when lower(bt.name) like 'pequena%' then 'Pequena'
           when lower(bt.name) like 'mini%' then 'Mini'
           when lower(bt.name) like 'econômica%' or lower(bt.name) like 'economica%' then 'Econômica'
           else null
         end as desired_name
  from public.basket_templates bt
  where bt.is_active=true
), resolved as (
  select t.id,s.id as subcategory_id
  from target t
  join public.basket_subcategories s
    on s.category_id=t.category_id
   and lower(s.name)=lower(t.desired_name)
   and s.is_active=true
  where t.desired_name is not null
)
update public.basket_templates bt
set subcategory_id=r.subcategory_id,
    updated_at=now()
from resolved r
where bt.id=r.id
  and bt.subcategory_id is distinct from r.subcategory_id;

-- Definitive cutover: the public site sells only mold-generated baskets.
update public.basket_molds
set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{transition_mode}','"mold_only"'::jsonb,true),
    updated_at=now()
where coalesce(metadata->>'transition_mode','')<>'mold_only';

-- Keep physical legacy lots and their history, but retire auxiliary commercial
-- templates (e.g. Koblenz variants) so they cannot surface as fixed-price cards.
with legacy_aux as (
  select distinct src.id
  from public.basket_molds m
  cross join lateral jsonb_array_elements_text(
    coalesce(m.metadata->'legacy_source_basket_ids','[]'::jsonb)
  ) x(id_text)
  join public.basket_templates src on src.id=x.id_text::uuid
  where src.id<>m.basket_id
)
update public.basket_templates bt
set is_active=false,
    updated_at=now()
from legacy_aux a
where bt.id=a.id
  and bt.is_active=true;

commit;
