-- Regression: explicit basket substitution catalog v3
-- Safe to run against canonical Supabase: all changes rollback.
begin;

do $$
declare
  v_pid uuid;
  v_family text;
  v_def text;
  v_rls boolean;
  v_count integer;
begin
  if to_regclass('public.basket_lot_substitution_products') is null then
    raise exception 'missing basket_lot_substitution_products';
  end if;
  if to_regprocedure('public.basket_substitution_family_for_product_v2(uuid)') is null then
    raise exception 'missing basket_substitution_family_for_product_v2';
  end if;
  if to_regprocedure('public.basket_lot_substitution_catalog_admin_v1()') is null then
    raise exception 'missing basket_lot_substitution_catalog_admin_v1';
  end if;
  if to_regprocedure('public.basket_lot_substitution_family_save_admin_v1(text,text,boolean,uuid[],text)') is null then
    raise exception 'missing basket_lot_substitution_family_save_admin_v1';
  end if;

  select relrowsecurity into v_rls from pg_class where oid='public.basket_lot_substitution_products'::regclass;
  if coalesce(v_rls,false) is not true then raise exception 'substitution product catalog must have RLS enabled'; end if;

  if has_table_privilege('anon','public.basket_lot_substitution_products','select')
     or has_table_privilege('authenticated','public.basket_lot_substitution_products','select') then
    raise exception 'substitution product catalog exposed directly to browser roles';
  end if;

  select count(*) into v_count from public.basket_lot_substitution_products;
  if v_count=0 then raise exception 'legacy substitution products were not migrated'; end if;

  if exists(
    select 1 from public.basket_lot_substitution_products m
    left join public.basket_lot_substitution_rules r on r.family_key=m.family_key
    where r.family_key is null
  ) then raise exception 'mapping points to missing family'; end if;

  select product_id,family_key into v_pid,v_family
  from public.basket_lot_substitution_products
  order by created_at,product_id
  limit 1;
  if v_pid is null then raise exception 'no mapped product available for test'; end if;
  if public.basket_substitution_family_for_product_v2(v_pid) is distinct from v_family then
    raise exception 'explicit mapping not returned';
  end if;

  delete from public.basket_lot_substitution_products where product_id=v_pid;
  if public.basket_substitution_family_for_product_v2(v_pid) is not null then
    raise exception 'removed product still considered substitutable';
  end if;

  select pg_get_functiondef('public.generate_basket_lot_suggestions_v1(date,text,boolean)'::regprocedure) into v_def;
  if position('basket_lot_substitution_products' in v_def)=0 then
    raise exception 'generator does not use explicit substitution catalog';
  end if;
end $$;

rollback;
