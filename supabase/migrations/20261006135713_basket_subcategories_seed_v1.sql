update public.basket_categories set is_active=slug in ('cestas-completas','cestas-so-alimentos'),sort_order=case slug when 'cestas-completas' then 10 when 'cestas-so-alimentos' then 20 else sort_order end;
insert into public.basket_subcategories(category_id,name,sort_order,is_active)
select c.id,s.name,s.sort_order,true from public.basket_categories c cross join (values ('Grande',10),('Média',20),('Pequena',30),('Mini',40)) as s(name,sort_order)
where c.slug in ('cestas-completas','cestas-so-alimentos')
on conflict(category_id,name) do update set sort_order=excluded.sort_order,is_active=true,updated_at=now();