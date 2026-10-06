begin;

do $$
declare
  v_complete uuid;
  v_food uuid;
  v_kits uuid;
begin
  select id into v_complete from public.basket_categories where slug='cestas-completas' limit 1;
  if v_complete is null then
    insert into public.basket_categories(name,slug,sort_order,is_active)
    values ('Cestas Completas','cestas-completas',10,true)
    returning id into v_complete;
  end if;
  update public.basket_categories set name='Cestas Completas',sort_order=10,is_active=true where id=v_complete;

  select id into v_food from public.basket_categories
    where slug in ('cestas-so-alimentos','cestas-so-alimento')
    order by case when slug='cestas-so-alimentos' then 0 else 1 end
    limit 1;
  if v_food is null then
    insert into public.basket_categories(name,slug,sort_order,is_active)
    values ('Cestas Só Alimentos','cestas-so-alimentos',20,true)
    returning id into v_food;
  else
    update public.basket_categories
       set name='Cestas Só Alimentos',slug='cestas-so-alimentos',sort_order=20,is_active=true
     where id=v_food;
  end if;

  select id into v_kits from public.basket_categories
    where slug in ('kits-promocionais','kits-limpeza-e-higiene')
    order by case when slug='kits-promocionais' then 0 else 1 end
    limit 1;
  if v_kits is null then
    insert into public.basket_categories(name,slug,sort_order,is_active)
    values ('Kits Promocionais','kits-promocionais',30,true)
    returning id into v_kits;
  else
    update public.basket_categories
       set name='Kits Promocionais',slug='kits-promocionais',sort_order=30,is_active=true
     where id=v_kits;
  end if;

  update public.basket_categories
     set is_active=false
   where slug in ('kits-limpeza','kits-higiene','kits-limpeza-e-higiene')
     and id<>v_kits;

  update public.basket_templates
     set category_id=v_food,updated_at=now()
   where lower(name) like '%só alimento%'
      or upper(name) like '%SO ALIMENTO%'
      or lower(name)='econômica';

  update public.basket_templates
     set category_id=v_kits,updated_at=now()
   where name ilike 'kit%';
end;
$$;

create or replace function public.admin_basket_mold_list_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active=true
  ) then raise exception 'admin_not_authorized'; end if;

  return jsonb_build_object(
    'baskets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'name',b.name,'image_url',b.image_url,'is_active',b.is_active,
        'category_id',b.category_id,'category_name',c.name,
        'mold_configured',(m.id is not null),'hidden_adjustment',coalesce(m.hidden_adjustment,0),
        'public_composition_count',coalesce(m.public_composition_count,2)
      ) order by b.sort_order,b.name,b.id)
      from public.basket_templates b
      left join public.basket_molds m on m.basket_id=b.id
      left join public.basket_categories c on c.id=b.category_id
      where b.is_active=true
        and coalesce((b.rules->>'mold_legacy_source')::boolean,false)=false
        and coalesce((b.rules->>'mold_internal_legacy')::boolean,false)=false
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'sort_order',c.sort_order) order by c.sort_order,c.name)
      from public.basket_categories c
      where c.is_active=true and c.slug in ('cestas-completas','cestas-so-alimentos','kits-promocionais')
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_category_id uuid;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active=true
  ) then
    raise exception 'admin_not_authorized';
  end if;

  v_result := public.basket_mold_editor_v1(p_basket_id);
  if v_result is null then
    raise exception 'basket_mold_basket_not_found';
  end if;

  select b.category_id into v_category_id
    from public.basket_templates b where b.id=p_basket_id;

  return v_result || jsonb_build_object('category_id',v_category_id);
end;
$function$;

create or replace function public.admin_save_basket_mold_v1(
  p_basket_id uuid,
  p_name text,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_category_id uuid,
  p_operator text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not exists (
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active=true and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.basket_categories c
    where c.id=p_category_id and c.is_active=true
      and c.slug in ('cestas-completas','cestas-so-alimentos','kits-promocionais')
  ) then
    raise exception 'basket_category_invalid';
  end if;

  v_result := public.admin_save_basket_mold_v1(
    p_basket_id,p_name,p_hidden_adjustment,p_public_composition_count,p_positions,p_operator
  );

  update public.basket_templates
     set category_id=p_category_id,updated_at=now()
   where id=p_basket_id;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('category_id',p_category_id);
end;
$function$;

revoke all on function public.admin_basket_mold_list_v1() from public,anon,authenticated;
grant execute on function public.admin_basket_mold_list_v1() to authenticated;

revoke all on function public.admin_basket_mold_editor_v1(uuid) from public,anon,authenticated;
grant execute on function public.admin_basket_mold_editor_v1(uuid) to authenticated;

revoke all on function public.admin_save_basket_mold_v1(uuid,text,numeric,integer,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_save_basket_mold_v1(uuid,text,numeric,integer,jsonb,uuid,text) to authenticated;

commit;
