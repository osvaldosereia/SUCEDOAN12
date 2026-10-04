insert into public.basket_categories (name,slug,sort_order,is_active)
values
  ('Cestas Completas','cestas-completas',10,true),
  ('Cestas Só Alimento','cestas-so-alimento',20,true),
  ('Kits Limpeza e Higiene','kits-limpeza-e-higiene',30,true),
  ('Kits Limpeza','kits-limpeza',40,true),
  ('Kits Higiene','kits-higiene',50,true)
on conflict (slug) do update
set name=excluded.name,
    sort_order=excluded.sort_order,
    is_active=true,
    updated_at=now();
