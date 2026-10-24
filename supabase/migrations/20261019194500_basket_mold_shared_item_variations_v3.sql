-- Cestas completas: alternativas compartilhadas (até 40) e inclusão de novos tipos.
-- A vitrine continua exibindo até 3 alternativas, com o menor preço disponível selecionado.
begin;

alter table public.basket_mold_shared_item_options
  drop constraint if exists basket_mold_shared_item_options_sort_order_check;
alter table public.basket_mold_shared_item_options
  add constraint basket_mold_shared_item_options_sort_order_check
    check (sort_order between 0 and 39);

create or replace function public.enforce_basket_mold_position_option_limit_v1()
returns trigger
language plpgsql set search_path=''
as $function$
declare v_count integer; v_limit integer:=3;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.position_id::text,0));
  select case when cat.slug='cestas-completas' then 40 else 3 end
    into v_limit
  from public.basket_mold_positions pos
  join public.basket_molds m on m.id=pos.mold_id
  join public.basket_templates b on b.id=m.basket_id
  join public.basket_categories cat on cat.id=b.category_id
  where pos.id=new.position_id;
  select count(*) into v_count from public.basket_mold_position_options where position_id=new.position_id;
  if v_count >= coalesce(v_limit,3) then raise exception 'basket_mold_position_options_limit'; end if;
  return new;
end;
$function$;

-- One-item transactional upsert; no mass rewriting of unrelated catalog entries.
create or replace function public.admin_upsert_basket_mold_shared_item_v2(p_item jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_label text;
  v_old_label text;
  v_options jsonb;
  v_option jsonb;
  v_product uuid;
  v_seen uuid[]:='{}'::uuid[];
  v_order integer:=0;
  v_limit integer:=40;
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if p_item is null or jsonb_typeof(p_item)<>'object' then
    raise exception 'basket_mold_shared_item_invalid';
  end if;
  v_label:=btrim(coalesce(p_item->>'label',''));
  v_options:=p_item->'options';
  if v_label='' or char_length(v_label)>180
     or coalesce(jsonb_typeof(v_options),'')<>'array'
     or jsonb_array_length(v_options) < 1 or jsonb_array_length(v_options)>v_limit then
    raise exception 'basket_mold_shared_item_invalid';
  end if;
  -- Prevent overlapping mutations on the shared registry.
  perform pg_advisory_xact_lock(hashtextextended('basket_mold_shared_items:cestas-completas',0));
  v_id:=nullif(p_item->>'id','')::uuid;
  if v_id is null then
    insert into public.basket_mold_shared_items(scope,label,sort_order,metadata)
    values ('cestas-completas',v_label,
      (select coalesce(max(sort_order)+1,0) from public.basket_mold_shared_items where scope='cestas-completas'),
      jsonb_build_object('updated_by',v_uid))
    returning id into v_id;
  else
    select label into v_old_label from public.basket_mold_shared_items
    where id=v_id and scope='cestas-completas' for update;
    if not found then raise exception 'basket_mold_shared_item_not_found'; end if;
    if v_label<>v_old_label then
      -- Allow a rename while preserving existing quantities in each basket.
      update public.basket_mold_positions pos set label=v_label
      from public.basket_molds m,public.basket_templates b,public.basket_categories cat
      where pos.mold_id=m.id and m.basket_id=b.id and b.category_id=cat.id
        and cat.slug='cestas-completas' and pos.label=v_old_label;
    end if;
    update public.basket_mold_shared_items set label=v_label,
       updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid)
    where id=v_id;
  end if;
  for v_option in select value from jsonb_array_elements(v_options) loop
    v_product:=nullif(v_option->>'product_id','')::uuid;
    if v_product is null or v_product=any(v_seen)
      or not exists(select 1 from public.products p where p.id=v_product and p.is_active=true) then
      raise exception 'basket_mold_shared_product_invalid';
    end if;
    v_seen:=array_append(v_seen,v_product);
  end loop;

  delete from public.basket_mold_shared_item_options where shared_item_id=v_id;
  for v_option in select value from jsonb_array_elements(v_options) loop
    insert into public.basket_mold_shared_item_options(shared_item_id,product_id,sort_order)
    values (v_id,(v_option->>'product_id')::uuid,v_order);
    v_order:=v_order+1;
  end loop;

  -- Materialize the shared choices into each active position, without touching quantities.
  delete from public.basket_mold_position_options op
    using public.basket_mold_positions pos,public.basket_molds m,
          public.basket_templates b,public.basket_categories cat
    where op.position_id=pos.id and pos.mold_id=m.id and m.basket_id=b.id
      and b.category_id=cat.id and cat.slug='cestas-completas' and pos.label=v_label;
  insert into public.basket_mold_position_options(position_id,product_id,sort_order)
    select pos.id,op.product_id,op.sort_order
    from public.basket_mold_positions pos
    join public.basket_molds m on m.id=pos.mold_id
    join public.basket_templates b on b.id=m.basket_id
    join public.basket_categories cat on cat.id=b.category_id and cat.slug='cestas-completas'
    join public.basket_mold_shared_item_options op on op.shared_item_id=v_id
    where pos.label=v_label;
  return public.admin_basket_mold_shared_items_v1() || jsonb_build_object('item_id',v_id);
end;
$function$;

revoke all on function public.admin_upsert_basket_mold_shared_item_v2(jsonb) from public,anon,authenticated;
grant execute on function public.admin_upsert_basket_mold_shared_item_v2(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
commit;