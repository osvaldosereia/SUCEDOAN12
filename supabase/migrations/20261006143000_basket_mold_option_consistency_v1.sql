-- Basket Mold option consistency v1
-- Normaliza dados já existentes sem tocar em estoque/lotes/pedidos.
-- Casos encontrados: Papel Higiênico em Só Alimento, Macarrão Lámen -> Caldo de Galinha,
-- e posição Rosquinha de Coco Rancheiro 500 g preenchida com biscoitos de 76-130 g.

-- 1) Cestas Só Alimento: remove apenas opções claramente não alimentares.
delete from public.basket_mold_position_options o
using public.basket_mold_positions p,
      public.basket_molds m,
      public.basket_templates b,
      public.basket_categories c,
      public.products pr
where o.position_id=p.id
  and p.mold_id=m.id
  and m.basket_id=b.id
  and b.category_id=c.id
  and o.product_id=pr.id
  and c.slug='cestas-so-alimentos'
  and coalesce(pr.customer_subcategory,'') in ('Higiene Pessoal','Limpeza','Lavanderia');

-- Posições que eram exclusivamente não alimentares (ex.: Papel Higiênico) ficam vazias e saem do molde.
delete from public.basket_mold_positions p
using public.basket_molds m,
      public.basket_templates b,
      public.basket_categories c
where p.mold_id=m.id
  and m.basket_id=b.id
  and b.category_id=c.id
  and c.slug='cestas-so-alimentos'
  and not exists (
    select 1 from public.basket_mold_position_options o where o.position_id=p.id
  );

-- 2) Macarrão Lámen: Caldo de Galinha não é variação equivalente.
delete from public.basket_mold_position_options o
using public.basket_mold_positions p,
      public.products pr
where o.position_id=p.id
  and o.product_id=pr.id
  and (p.label ilike '%Macarrão Lámen%' or p.label ilike '%Macarrão Lamen%')
  and pr.name ilike '%Caldo de Galinha%';

-- 3) Rosquinha 500 g: garante uma opção canônica segura antes de retirar biscoitos não equivalentes.
insert into public.basket_mold_position_options(position_id,product_id,sort_order,metadata)
select p.id,pr.id,0,jsonb_build_object('normalized_by','basket_mold_option_consistency_v1')
from public.basket_mold_positions p
join public.basket_molds m on m.id=p.mold_id
join public.basket_templates b on b.id=m.basket_id
join public.products pr on pr.sku='P0061' and pr.name='Rosquinha de Coco Rancheiro 500 g'
where b.is_active=true
  and p.label ilike '%Rosquinha%'
  and p.label ilike '%500%'
  and not exists (
    select 1 from public.basket_mold_position_options x
    where x.position_id=p.id and x.product_id=pr.id
  );

delete from public.basket_mold_position_options o
using public.basket_mold_positions p,
      public.products pr
where o.position_id=p.id
  and o.product_id=pr.id
  and p.label ilike '%Rosquinha%'
  and p.label ilike '%500%'
  and pr.name not ilike '%Rosquinha%';

-- Guard central: protege qualquer gravação futura, inclusive chamadas que não passem pelo Admin.
create or replace function public.basket_mold_option_consistency_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_category_slug text;
  v_position_label text;
  v_candidate_sub text;
  v_candidate_leaf text;
  v_candidate_name text;
  v_reference_leaf text;
begin
  select c.slug,p.label,pr.customer_subcategory,pr.customer_subsubcategory,pr.name
    into v_category_slug,v_position_label,v_candidate_sub,v_candidate_leaf,v_candidate_name
  from public.basket_mold_positions p
  join public.basket_molds m on m.id=p.mold_id
  join public.basket_templates b on b.id=m.basket_id
  left join public.basket_categories c on c.id=b.category_id
  join public.products pr on pr.id=new.product_id
  where p.id=new.position_id;

  if v_position_label is null then
    raise exception 'basket_mold_position_not_found';
  end if;

  if v_category_slug='cestas-so-alimentos'
     and coalesce(v_candidate_sub,'') in ('Higiene Pessoal','Limpeza','Lavanderia') then
    raise exception 'basket_mold_food_only_product_invalid';
  end if;

  if v_position_label ilike '%Rosquinha%'
     and coalesce(v_candidate_name,'') not ilike '%Rosquinha%' then
    raise exception 'basket_mold_option_name_mismatch';
  end if;

  select pr.customer_subsubcategory
    into v_reference_leaf
  from public.basket_mold_position_options o
  join public.products pr on pr.id=o.product_id
  where o.position_id=new.position_id
    and o.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
    and nullif(btrim(coalesce(pr.customer_subsubcategory,'')),'') is not null
  order by o.sort_order,o.created_at,o.id
  limit 1;

  if nullif(btrim(coalesce(v_reference_leaf,'')),'') is not null
     and nullif(btrim(coalesce(v_candidate_leaf,'')),'') is not null
     and lower(btrim(v_reference_leaf))<>lower(btrim(v_candidate_leaf)) then
    raise exception 'basket_mold_option_taxonomy_mismatch';
  end if;

  return new;
end;
$function$;

revoke all on function public.basket_mold_option_consistency_guard_v1() from public,anon,authenticated;
grant execute on function public.basket_mold_option_consistency_guard_v1() to service_role;

drop trigger if exists basket_mold_option_consistency_guard_v1 on public.basket_mold_position_options;
create trigger basket_mold_option_consistency_guard_v1
before insert or update of position_id,product_id
on public.basket_mold_position_options
for each row execute function public.basket_mold_option_consistency_guard_v1();
