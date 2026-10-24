-- Dona Antônia · Cestas Molde · acréscimo oculto condicionado por produto v1
begin;

alter table public.basket_molds
  add column if not exists conditional_hidden_enabled boolean not null default false,
  add column if not exists conditional_hidden_product_id uuid,
  add column if not exists conditional_hidden_adjustment numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='basket_molds_conditional_hidden_product_id_fkey'
      and conrelid='public.basket_molds'::regclass
  ) then
    alter table public.basket_molds
      add constraint basket_molds_conditional_hidden_product_id_fkey
      foreign key (conditional_hidden_product_id)
      references public.products(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='basket_molds_conditional_hidden_adjustment_check'
      and conrelid='public.basket_molds'::regclass
  ) then
    alter table public.basket_molds
      add constraint basket_molds_conditional_hidden_adjustment_check
      check (conditional_hidden_adjustment >= 0 and conditional_hidden_adjustment <= 9999999);
  end if;
end $$;

create index if not exists basket_molds_conditional_hidden_product_idx
  on public.basket_molds(conditional_hidden_product_id)
  where conditional_hidden_product_id is not null;

create or replace function public.basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'basket_id', b.id,
    'basket_name', b.name,
    'basket_image_url', b.image_url,
    'mold_id', m.id,
    'hidden_adjustment', coalesce(m.hidden_adjustment, 0),
    'conditional_hidden_enabled', coalesce(m.conditional_hidden_enabled, false),
    'conditional_hidden_product_id', m.conditional_hidden_product_id,
    'conditional_hidden_adjustment', coalesce(m.conditional_hidden_adjustment, 0),
    'conditional_hidden_product',
      case when cp.id is null then null else jsonb_build_object(
        'product_id', cp.id,
        'name', cp.name,
        'sku', cp.sku,
        'gtin', cp.gtin,
        'image_url', cp.image_url,
        'packaging', cp.packaging,
        'is_active', cp.is_active
      ) end,
    'public_composition_count', coalesce(m.public_composition_count, 2),
    'metadata', coalesce(m.metadata, '{}'::jsonb),
    'positions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position_id', pos.id,
          'label', pos.label,
          'quantity', pos.quantity,
          'sort_order', pos.sort_order,
          'metadata', pos.metadata,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'option_id', opt.id,
                'product_id', p.id,
                'name', p.name,
                'sku', p.sku,
                'gtin', p.gtin,
                'image_url', p.image_url,
                'is_active', p.is_active,
                'sort_order', opt.sort_order,
                'metadata', opt.metadata
              ) order by opt.sort_order, opt.id
            )
            from public.basket_mold_position_options opt
            join public.products p on p.id = opt.product_id
            where opt.position_id = pos.id
          ), '[]'::jsonb)
        ) order by pos.sort_order, pos.id
      )
      from public.basket_mold_positions pos
      where pos.mold_id = m.id
    ), '[]'::jsonb)
  )
  from public.basket_templates b
  left join public.basket_molds m on m.basket_id = b.id
  left join public.products cp on cp.id = m.conditional_hidden_product_id
  where b.id = p_basket_id;
$function$;

create or replace function public.admin_save_basket_mold_v3(
  p_basket_id uuid,
  p_name text,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_conditional_hidden_enabled boolean,
  p_conditional_hidden_product_id uuid,
  p_conditional_hidden_adjustment numeric,
  p_operator text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_name text:=btrim(coalesce(p_name,''));
  v_result jsonb;
  v_conditional numeric:=round(coalesce(p_conditional_hidden_adjustment,0),2);
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a
    where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then
    raise exception 'admin_not_authorized';
  end if;

  if p_basket_id is null or not exists(
    select 1 from public.basket_templates b where b.id=p_basket_id
  ) then raise exception 'basket_mold_basket_not_found'; end if;

  if not exists(
    select 1 from public.basket_categories c
    where c.id=p_category_id and c.is_active
  ) then raise exception 'basket_category_invalid'; end if;

  if not exists(
    select 1 from public.basket_subcategories s
    where s.id=p_subcategory_id and s.category_id=p_category_id and s.is_active
  ) then raise exception 'basket_subcategory_invalid'; end if;

  if v_name='' or char_length(v_name)>180 then
    raise exception 'basket_mold_name_invalid';
  end if;

  if v_conditional<0 or v_conditional>9999999 then
    raise exception 'basket_mold_conditional_hidden_adjustment_invalid';
  end if;

  if p_conditional_hidden_product_id is not null and not exists(
    select 1 from public.products p where p.id=p_conditional_hidden_product_id
  ) then
    raise exception 'basket_mold_conditional_hidden_product_invalid';
  end if;

  if coalesce(p_conditional_hidden_enabled,false) then
    if p_conditional_hidden_product_id is null then
      raise exception 'basket_mold_conditional_hidden_product_required';
    end if;
    if v_conditional<=0 then
      raise exception 'basket_mold_conditional_hidden_adjustment_required';
    end if;
  end if;

  update public.basket_templates
     set name=v_name,
         category_id=p_category_id,
         subcategory_id=p_subcategory_id,
         updated_at=now()
   where id=p_basket_id;

  v_result:=public.save_basket_mold_v1(
    p_basket_id,
    p_hidden_adjustment,
    p_public_composition_count,
    p_positions,
    coalesce(nullif(btrim(p_operator),''),'Operação')
  );

  update public.basket_molds
     set conditional_hidden_enabled=coalesce(p_conditional_hidden_enabled,false),
         conditional_hidden_product_id=p_conditional_hidden_product_id,
         conditional_hidden_adjustment=v_conditional,
         metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
           'conditional_hidden_rule_version',1,
           'updated_by',coalesce(nullif(btrim(p_operator),''),'Operação')
         ),
         updated_at=now()
   where basket_id=p_basket_id;

  return public.basket_mold_editor_v1(p_basket_id)
    || jsonb_build_object(
      'basket_name',v_name,
      'category_id',p_category_id,
      'subcategory_id',p_subcategory_id
    );
end;
$function$;

revoke all on function public.admin_save_basket_mold_v3(
  uuid,text,numeric,integer,jsonb,uuid,uuid,boolean,uuid,numeric,text
) from public,anon,authenticated;
grant execute on function public.admin_save_basket_mold_v3(
  uuid,text,numeric,integer,jsonb,uuid,uuid,boolean,uuid,numeric,text
) to authenticated;

do $patch$
declare
  v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;

  v_old := $old$  v_composition_number integer;
$old$;
  v_new := $new$  v_composition_number integer;
  v_conditional_hidden_applied numeric:=0;
$new$;
  if position(v_old in v_def)=0 then
    raise exception 'basket_mold_conditional_decl_anchor_missing';
  end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$      end loop;

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;$old$;
  v_new := $new$      end loop;

      v_conditional_hidden_applied:=0;
      if coalesce(v_mold.conditional_hidden_enabled,false)
         and v_mold.conditional_hidden_product_id is not null
         and coalesce(v_mold.conditional_hidden_adjustment,0)>0
         and exists(
           select 1
           from jsonb_array_elements(v_component_snapshot) c
           where c->>'product_id'=v_mold.conditional_hidden_product_id::text
             and coalesce(nullif(c->>'quantity','')::numeric,0)>0
         )
      then
        v_conditional_hidden_applied:=round(v_mold.conditional_hidden_adjustment,2);
        v_basket_unit:=v_basket_unit+v_conditional_hidden_applied;
      end if;

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;$new$;
  if position(v_old in v_def)=0 then
    raise exception 'basket_mold_conditional_apply_anchor_missing';
  end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$          'hidden_value_fixed',v_mold.hidden_adjustment,'hidden_value_preserved',true,
          'component_snapshot'$old$;
  v_new := $new$          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_enabled',v_mold.conditional_hidden_enabled,
          'conditional_hidden_product_id',v_mold.conditional_hidden_product_id,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',coalesce(v_mold.hidden_adjustment,0)+v_conditional_hidden_applied,
          'hidden_value_preserved',true,
          'component_snapshot'$new$;
  if position(v_old in v_def)=0 then
    raise exception 'basket_mold_conditional_item_metadata_anchor_missing';
  end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old := $old$          'hidden_value_fixed',v_mold.hidden_adjustment,'components',v_component_snapshot)$old$;
  v_new := $new$          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',coalesce(v_mold.hidden_adjustment,0)+v_conditional_hidden_applied,
          'components',v_component_snapshot)$new$;
  if position(v_old in v_def)=0 then
    raise exception 'basket_mold_conditional_sep_anchor_missing';
  end if;
  v_def:=replace(v_def,v_old,v_new);

  execute v_def;
end
$patch$;

notify pgrst, 'reload schema';
commit;
