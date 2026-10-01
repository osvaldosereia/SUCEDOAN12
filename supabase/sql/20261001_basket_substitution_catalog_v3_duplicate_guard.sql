-- Dona Antonia · proteção contra criação duplicada de família de substituição.
-- Se o fluxo "Nova família" gerar uma chave já existente, rejeita sem alterar a família atual.

create or replace function public.basket_lot_substitution_family_save_admin_v1(
  p_family_key text,
  p_label text,
  p_enabled boolean,
  p_product_ids uuid[],
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key text;
  v_label text:=trim(coalesce(p_label,''));
  v_sort integer;
  v_operator text:=coalesce(nullif(trim(coalesce(p_operator,'')),''),'Operação');
  v_ids uuid[]:=coalesce(p_product_ids,array[]::uuid[]);
  v_is_new boolean:=nullif(trim(coalesce(p_family_key,'')),'') is null;
begin
  if not public.basket_lot_admin_allowed_v1() then raise exception 'admin_forbidden'; end if;
  if length(v_label)<2 or length(v_label)>80 then raise exception 'invalid_family_label'; end if;

  v_key:=lower(trim(coalesce(p_family_key,'')));
  if v_key='' then
    v_key:=trim(both '_' from regexp_replace(public.basket_auto_norm_text_v1(v_label),'[^a-z0-9]+','_','g'));
  end if;
  if v_key='' or v_key!~'^[a-z0-9_]{2,60}$' then raise exception 'invalid_family_key'; end if;

  if v_is_new and exists(
    select 1 from public.basket_lot_substitution_rules where family_key=v_key
  ) then
    raise exception 'family_already_exists';
  end if;

  select sort_order into v_sort
  from public.basket_lot_substitution_rules
  where family_key=v_key;
  if v_sort is null then
    select coalesce(max(sort_order),0)+10 into v_sort
    from public.basket_lot_substitution_rules;
  end if;

  insert into public.basket_lot_substitution_rules(
    family_key,label,enabled,sort_order,metadata,updated_at
  ) values(
    v_key,v_label,coalesce(p_enabled,false),v_sort,
    jsonb_build_object('edited_by',v_operator,'catalog_v3',true),now()
  )
  on conflict(family_key) do update set
    label=excluded.label,
    enabled=excluded.enabled,
    metadata=coalesce(public.basket_lot_substitution_rules.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  if exists(
    select 1
    from unnest(v_ids) x(id)
    left join public.products p on p.id=x.id
    where p.id is null
  ) then
    raise exception 'product_not_found';
  end if;

  delete from public.basket_lot_substitution_products m
  where m.family_key=v_key
    and not(m.product_id=any(v_ids));

  insert into public.basket_lot_substitution_products(
    product_id,family_key,updated_by,metadata,updated_at
  )
  select distinct x.id,v_key,v_operator,
    jsonb_build_object('source','admin','catalog_v3',true),now()
  from unnest(v_ids) x(id)
  join public.products p on p.id=x.id
  on conflict(product_id) do update set
    family_key=excluded.family_key,
    updated_by=excluded.updated_by,
    metadata=coalesce(public.basket_lot_substitution_products.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'family_key',v_key,
    'label',v_label,
    'enabled',coalesce(p_enabled,false),
    'product_count',(
      select count(*)
      from public.basket_lot_substitution_products
      where family_key=v_key
    )
  );
end;
$$;

revoke all on function public.basket_lot_substitution_family_save_admin_v1(text,text,boolean,uuid[],text) from public,anon;
grant execute on function public.basket_lot_substitution_family_save_admin_v1(text,text,boolean,uuid[],text) to authenticated,service_role;
